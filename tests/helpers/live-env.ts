/** Live tests read real credentials from .env / the environment. */
import "dotenv/config";
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "warn";
