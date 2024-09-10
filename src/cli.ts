import { DEFAULT_SASS_MIGRATOR_MAX_ENTRIES, VueStyleMigrator } from "./migrate";
import process from "node:process";
import { parseIntArg } from "./utils";


async function main() {
  const sassMigratorMaxEntries = parseIntArg(process.env["SASS_MIGRATOR_MAX_ENTRIES"]) ?? DEFAULT_SASS_MIGRATOR_MAX_ENTRIES;
  const dir = process.argv[2] || ".";
  const migrator = new VueStyleMigrator(dir, {
    sassMigratorMaxEntries,
  });
  await migrator.migrate();
}

main().catch(e => {
  process.exitCode = 1;
  console.error(e);
});
