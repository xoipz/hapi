/**
 * Stream implementation for handling async message streams
 * Provides an async iterable interface for processing SDK messages
 */

import { logger } from '@/ui/logger';

let streamCounter = 0;

/**
 * Generic async stream implementation
 * Handles queuing, error propagation, and proper cleanup
 */
export class Stream<T> implements AsyncIterableIterator<T> {
    private queue: T[] = []
    private readResolve?: (value: IteratorResult<T>) => void
    private readReject?: (error: Error) => void
    private isDone = false
    private hasError?: Error
    private started = false
    public readonly instanceId: number

    constructor(private returned?: () => void) {
        this.instanceId = ++streamCounter;
        logger.debug(`[Stream#${this.instanceId}] Created`);
    }

    /**
     * Implements async iterable protocol
     */
    [Symbol.asyncIterator](): AsyncIterableIterator<T> {
        if (this.started) {
            throw new Error('Stream can only be iterated once')
        }
        this.started = true
        logger.debug(`[Stream#${this.instanceId}] Iterator started`)
        return this
    }

    /**
     * Gets the next value from the stream
     */
    async next(): Promise<IteratorResult<T>> {
        logger.debug(`[Stream#${this.instanceId}] next() called, queue: ${this.queue.length}, isDone: ${this.isDone}, hasResolver: ${!!this.readResolve}`)

        // Return queued items first
        if (this.queue.length > 0) {
            const value = this.queue.shift()!
            logger.debug(`[Stream#${this.instanceId}] Returning queued item, remaining: ${this.queue.length}`)
            return Promise.resolve({
                done: false,
                value
            })
        }

        // Check terminal states
        if (this.isDone) {
            logger.debug(`[Stream#${this.instanceId}] Stream is done, returning done`)
            return Promise.resolve({ done: true, value: undefined })
        }

        if (this.hasError) {
            logger.debug(`[Stream#${this.instanceId}] Stream has error: ${this.hasError.message}`)
            return Promise.reject(this.hasError)
        }

        // Wait for new data
        logger.debug(`[Stream#${this.instanceId}] Setting resolver and waiting...`)
        return new Promise((resolve, reject) => {
            this.readResolve = resolve
            this.readReject = reject
            logger.debug(`[Stream#${this.instanceId}] Resolver SET, hasResolver: ${!!this.readResolve}`)
        })
    }

    /**
     * Adds a value to the stream
     */
    enqueue(value: T): void {
        logger.debug(`[Stream#${this.instanceId}] enqueue(), hasResolver: ${!!this.readResolve}`)
        if (this.readResolve) {
            // Direct delivery to waiting consumer
            const resolve = this.readResolve
            this.readResolve = undefined
            this.readReject = undefined
            logger.debug(`[Stream#${this.instanceId}] Delivering to waiter`)
            resolve({ done: false, value })
        } else {
            // Queue for later consumption
            this.queue.push(value)
            logger.debug(`[Stream#${this.instanceId}] Queued, length: ${this.queue.length}`)
        }
    }

    /**
     * Marks the stream as complete
     */
    done(): void {
        logger.debug(`[Stream#${this.instanceId}] done(), hasResolver: ${!!this.readResolve}, queue: ${this.queue.length}`)
        this.isDone = true
        if (this.readResolve) {
            const resolve = this.readResolve
            this.readResolve = undefined
            this.readReject = undefined
            resolve({ done: true, value: undefined })
        }
    }

    /**
     * Propagates an error through the stream
     */
    error(error: Error): void {
        logger.debug(`[Stream#${this.instanceId}] error(): ${error.message}`)
        this.hasError = error
        if (this.readReject) {
            const reject = this.readReject
            this.readResolve = undefined
            this.readReject = undefined
            reject(error)
        }
    }

    /**
     * Implements async iterator cleanup
     */
    async return(): Promise<IteratorResult<T>> {
        this.isDone = true
        if (this.returned) {
            this.returned()
        }
        return Promise.resolve({ done: true, value: undefined })
    }
}