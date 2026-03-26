import { TaggedError } from "better-result";

const InternalBugErrorBase = TaggedError("InternalBugError")<{
    message: string;
    cause?: unknown;
}>();

export class InternalBugError extends InternalBugErrorBase {}

export function internalBug(message: string, cause?: unknown): never {
    throw new InternalBugError({ message, cause });
}
