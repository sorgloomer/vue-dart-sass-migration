import * as webpack from "webpack";
import * as path from "node:path";
import { resolve } from "node:path";
import * as fs from "node:fs/promises";
import { JSDOM } from "jsdom";
import { VueLoaderPlugin } from "vue-loader";


export async function main() {
  console.log(await test({
    caseName: "app1",
    sassPackage: "node-sass",
  }));
  console.log(await test({
    caseName: "app2",
    sassPackage: "sass",
  }));
}

async function test({
  caseName,
  sassPackage
}: {
  caseName: string,
  sassPackage: string,
}) {
  const outputName = `${caseName}--${sassPackage}`;
  const outputPath = path.resolve(__dirname, "../temp/test");
  const config = await webpackConfig({
    outputPath,
    name: outputName,
    entry: `./src/${caseName}.vue`,
    sassPackage,
  });
  const stats = await acall<webpack.Stats | undefined>(cb => webpack.webpack(config, cb));
  if (!stats) {
    throw new Error("Unknown webpack error");
  }
  if (stats.compilation.errors?.length) {
    throw new Error(stats.toString({
      chunks: false, // Makes the build much quieter
      colors: true, // Shows colors in the console
    }));
  }

  const bundle = await fs.readFile(path.resolve(outputPath, `${outputName}.js`), "utf8");
  const dom = new JSDOM("", { runScripts: "outside-only" });
  dom.window.eval(bundle);
  const styleNodes = Array.from(dom.window.document.querySelectorAll("style"));
  return styleNodes.map(node => node.textContent).join("\n/* new node */\n");
}


const webpackConfig = async (options: {
  entry: string,
  name: string,
  outputPath: string,
  sassPackage: string,
}): Promise<webpack.Configuration> => ({
  mode: "development",
  context: resolve(__dirname, "."),
  devtool: false,

  entry: {
    [options.name]: {
      import: options.entry,
    },
  },
  output: {
    path: options.outputPath,
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        loader: "vue-loader",
      },
      {
        test: /\.scss$|\.sass$/,
        use: [
          "vue-style-loader",
          "css-loader",
          {
            loader: "sass-loader",
            options: {
              implementation: require(options.sassPackage),
              sourceMap: true,
              sassOptions: {
                outputStyle: "expanded",
              },
            },
          },
        ],
      },
      {
        test: /\.css$/,
        use: [
          "vue-style-loader",
          //MiniCssExtractPlugin.loader,
          "css-loader",
        ]
      },
    ],
  },
  plugins: [
    new VueLoaderPlugin() as any,

    //new MiniCssExtractPlugin({
    //  filename: `[name].css`,
    //}),
  ],
});

function acall<T>(fn: (cb: (err: any, result: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, value) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(value);
    });
  });
}

main().catch(e => {
  process.exitCode = e.exitCode || 1;
  console.error(e);
});

