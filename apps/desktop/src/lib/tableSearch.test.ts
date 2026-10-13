import { describe, expect, test } from "bun:test";
import { tableMatchesSearch } from "./tableSearch";

describe("table search", () => {
  test("matches the table name, ignoring case", () => {
    expect(tableMatchesSearch("users", "USER")).toBe(true);
    expect(tableMatchesSearch("app_user_roles", "user")).toBe(true);
  });

  test("ignores column names, so a user_id column does not match 'user'", () => {
    expect(tableMatchesSearch("notification_logs", "user")).toBe(false);
  });

  test("an empty search keeps every table", () => {
    expect(tableMatchesSearch("notification_logs", "")).toBe(true);
  });
});
