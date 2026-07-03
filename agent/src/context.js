const { getFileContent } = require('./github');

// file filtering

const SKIP_PATTERNS = [
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    /\.min\.js$/,
    /\.min\.css$/,
    /node_modules\//,
    /dist\//,
    /build\//,
    /\.next\//,
    /\.(png|jpg|jpeg|gif|svg|ico|webp)$/,
    /\.env(\.|$)/,
    /migrations/,
];

const DEFAULT_REVIEWABLE_EXTENSIONS = [
    '.js', '.jsx', '.ts', '.tsx',
    '.py', '.go', '.java', '.c',
    '.cpp', '.rb', '.php', '.cs', '.rs'
];

function shouldSkip(filename) {
    return SKIP_PATTERNS.some(pattern => pattern.test(filename));
}

function isReviewable(filename, extensions = DEFAULT_REVIEWABLE_EXTENSIONS) {
    if (shouldSkip(filename)) return false;
    return extensions.some(ext => filename.endsWith(ext));
}

// import parsing

//finds one level of local imports/requires in a file
//only follows relative imports (starting with ./ or ../), not node_modules

function parseImports(content, filename) {
    const imports = new Set();
    const dir = filename.substring(0, filename.lastIndexOf('/'));

    //match: require('./path') or require("./path")
    const requireRegex = /require\(['"](\.[^'"]+)['"]\)/g;
    //match: import ... from './path' or import './path'
    const importRegex = /from\s+['"](\.[^'"]+)['"]/g;

    for (const regex of [requireRegex, importRegex]) {
        let match;

        while ((match = regex.exec(content)) !== null) {
            const importPath = match[1];
            //resolve relative path from the file's directory
            const resolved = dir ? `${dir}/${importPath}` : importPath;
            //normalize path - remove ./ prefix, collapse ../ etc

            const normalized = resolved.split('/').reduce((acc, part) => {
                if (part === '..') {
                    acc.pop();
                }
                else if (part !== '.') {
                    acc.push(part);
                }

                return acc;
            }, []).join('/');

            imports.add(normalized);
        }
    }

    return Array.from(imports);
}

//import paths often omit the extension (e.g. require('./utils'))
//try common extensions to find the actual file
async function fetchWithExtensionFallback(owner, repo, path, ref) {
    //try exact path first
    const content = await getFileContent(owner, repo, path, ref);
    if (content) {
        return content;
    }

    //try with common extensions
    const extensions = ['.js', '.jsx', '.ts', '.tsx', '.py'];
    for (const ext of extensions) {
        const content = await getFileContent(owner, repo, path + ext, ref);
        if (content) {
            return content;
        }
    }

    return null;
}

//main function: takes diff files, fetches all context needed for review
//returns structured context object ready to be included in the Gemini prompt
async function buildContext(owner, repo, headSha, diffFiles, repoConfig = {}) {
    const extensions = repoConfig.extensions || DEFAULT_REVIEWABLE_EXTENSIONS;

    //filter diff to reviewable files only
    const reviewableFiles = diffFiles.filter(f =>
        f.status !== "removed" && isReviewable(f.filename, extensions)
    );

    const fileContents = {};
    const importContents = {};

    //fetch full content of each reviewable file
    for (const file of reviewableFiles) {
        const content = await getFileContent(owner, repo, file.filename, headSha);
        if (content) {
            fileContents[file.filename] = content;

            //parse one level of imports from this file
            const imports = parseImports(content, file.filename);
            for (const importPath of imports) {

                //don't re-fetch files already in the diff
                if (fileContents[importPath]) continue;
                if (importContents[importPath]) continue;

                const importContent = await fetchWithExtensionFallback(owner, repo, importPath, headSha);
                if (importContent) {
                    importContents[importPath] = importContent;
                }
            }
        }
    }

    //fetch repo-level context files
    const readme = await getFileContent(owner, repo, "README.md", headSha);
    const packageJson = await getFileContent(owner, repo, "package.json", headSha)
        || await getFileContent(owner, repo, "requirements.txt", headSha);

    return {
        reviewableFiles,
        fileContents,
        importContents,
        readme: readme || "",
        packageJson: packageJson || "",
        skippedFiles: diffFiles.filter(f => !reviewableFiles.find(r => r.filename === f.filename))
    };
}

module.exports = { buildContext, isReviewable, shouldSkip, DEFAULT_REVIEWABLE_EXTENSIONS };