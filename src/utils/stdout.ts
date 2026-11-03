import { writeSync } from "fs";
import { format } from "util";

export type ChunkWriter = (buffer: Buffer, offset: number) => number;

/**
 * Write every byte, even when each call accepts only part of the buffer.
 * Piped stdout often takes 64 KiB at a time; exiting before the rest is
 * copied into the pipe drops the tail.
 */
export function writeFully(write: ChunkWriter, data: Buffer): void {
  let offset = 0;
  while (offset < data.length) {
    const written = write(data, offset);
    if (!Number.isFinite(written) || written <= 0) {
      throw new Error("Failed to write the remaining stdout bytes");
    }
    offset += written;
  }
}

function writeRetry(fd: number, buffer: Buffer, offset: number): number {
  for (;;) {
    try {
      return writeSync(fd, buffer, offset, buffer.length - offset);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EAGAIN" && code !== "EWOULDBLOCK") throw err;
      Bun.sleepSync(1);
    }
  }
}

function toBuffer(chunk: string | Uint8Array, encoding?: BufferEncoding): Buffer {
  if (typeof chunk === "string") return Buffer.from(chunk, encoding);
  return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
}

/**
 * Make stdout writes blocking when output is a pipe or file.
 * Bun's console.log does not call process.stdout.write, and assigning
 * process.stdout.write puts the fd in non-blocking mode, so console.log
 * then drops everything past 64 KiB. Route console.log through the
 * blocking writer as well. A TTY is left alone so interactive tables
 * and spinners still stream.
 */
export function installBlockingStdout(): void {
  if (process.stdout.isTTY) return;
  const stdout = process.stdout as NodeJS.WriteStream & { fd?: number };
  const fd = typeof stdout.fd === "number" ? stdout.fd : 1;

  stdout.write = ((
    chunk: string | Uint8Array,
    encoding?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void
  ) => {
    let enc: BufferEncoding | undefined;
    let done: ((error?: Error | null) => void) | undefined;
    if (typeof encoding === "function") {
      done = encoding;
    } else {
      enc = encoding;
      done = callback;
    }

    try {
      writeFully((buffer, offset) => writeRetry(fd, buffer, offset), toBuffer(chunk, enc));
      done?.();
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (done) {
        done(error);
        return true;
      }
      throw error;
    }
  }) as typeof stdout.write;

  console.log = ((...args: unknown[]) => {
    stdout.write(format(...args) + "\n");
  }) as typeof console.log;
}
