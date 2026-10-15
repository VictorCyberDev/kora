import { assertTestDatabase } from "./test-database.js";

assertTestDatabase(process.env.DATABASE_URL);
