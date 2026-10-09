const esbuild = require("esbuild");
const fs = require('fs');
const path = require('path');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

function copyAssets() {
  const srcDir = path.join(__dirname, 'src/localization');
  const destDir = path.join(__dirname, 'localization');

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  if (fs.existsSync(srcDir)) {
    const files = fs.readdirSync(srcDir);
    files.forEach(file => {
      if (file.endsWith('.json')) {
        fs.copyFileSync(
          path.join(srcDir, file),
          path.join(destDir, file)
        );
      }
    });
    console.log('Localization files copied.');
  }
}

/**
 * The scripts and the stylesheet of the diagram are loaded by the webview as they are, so what the package ships is a
 * minified copy (media/trail/min). The sources stay in media/trail, where the tests read them.
 */
function buildTrail() {
  const srcDir = path.join(__dirname, 'media/trail');
  const outDir = path.join(srcDir, 'min');
  fs.mkdirSync(outDir, { recursive: true });
  fs.readdirSync(srcDir).filter(f => /.(js|css)$/.test(f)).forEach(file => {
    const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
    const out = esbuild.transformSync(code, { loader: file.endsWith('.css') ? 'css' : 'js', minify: production, legalComments: 'none' });
    fs.writeFileSync(path.join(outDir, file), out.code);
  });
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		copyAssets();
		buildTrail();
		await ctx.watch();
	} else {
		await ctx.rebuild();
		copyAssets();
		buildTrail();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
