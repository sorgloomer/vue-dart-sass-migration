const args = process.argv.slice(2);

const spawned = require("child_process").spawn(
  "./node_modules/ts-node/dist/bin.js",
  ["src/cli.ts", ...args],
  {
    stdio: "inherit",
  },
);
spawned.on("close", code => {
  if (code) {
    process.exitCode = code;
  }
})
