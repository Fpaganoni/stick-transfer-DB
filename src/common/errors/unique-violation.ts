import { BadRequestException } from "@nestjs/common";
import { AppError } from "./app.error";

/**
 * Maps a Prisma P2002 (unique constraint) error to a typed AppError.
 * `meta.target` is an array of column names, or a constraint name string
 * (e.g. "User_email_key") depending on the driver, so match by substring.
 * Returns null when `error` is not a unique violation.
 */
export function mapUniqueViolation(error: any): Error | null {
  if (error?.code !== "P2002") return null;
  const target = String([].concat(error.meta?.target ?? []).join(",")).toLowerCase();
  if (target.includes("email")) return AppError.emailTaken();
  if (target.includes("username")) return AppError.usernameTaken();
  return new BadRequestException("Resource already exists");
}
