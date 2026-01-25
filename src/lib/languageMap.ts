/**
 * File extension to Monaco Editor language mapping
 * Maps 50+ common file extensions to their corresponding Monaco language identifiers
 * 
 * Validates: Requirements 1.1
 */

/**
 * Map of file extensions (without dot) to Monaco Editor language identifiers
 */
export const extensionToLanguage: Record<string, string> = {
  // JavaScript/TypeScript
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',

  // Web
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',

  // Data formats
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  svg: 'xml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  properties: 'ini',

  // Programming languages
  py: 'python',
  pyw: 'python',
  pyi: 'python',
  rb: 'ruby',
  rake: 'ruby',
  gemspec: 'ruby',
  php: 'php',
  php3: 'php',
  php4: 'php',
  php5: 'php',
  phtml: 'php',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  sc: 'scala',
  go: 'go',
  rs: 'rust',
  swift: 'swift',
  m: 'objective-c',
  mm: 'objective-c',

  // C/C++
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',

  // C#/F#
  cs: 'csharp',
  csx: 'csharp',
  fs: 'fsharp',
  fsi: 'fsharp',
  fsx: 'fsharp',

  // Shell/Scripts
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ksh: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  psd1: 'powershell',
  bat: 'bat',
  cmd: 'bat',

  // Database
  sql: 'sql',
  mysql: 'sql',
  pgsql: 'pgsql',
  plsql: 'sql',

  // Markup/Documentation
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  rst: 'restructuredtext',
  tex: 'latex',
  latex: 'latex',

  // DevOps/Config
  dockerfile: 'dockerfile',
  docker: 'dockerfile',
  tf: 'hcl',
  tfvars: 'hcl',
  hcl: 'hcl',
  nginx: 'nginx',
  apache: 'apache',

  // Other languages
  lua: 'lua',
  perl: 'perl',
  pl: 'perl',
  pm: 'perl',
  r: 'r',
  R: 'r',
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  edn: 'clojure',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hrl: 'erlang',
  hs: 'haskell',
  lhs: 'haskell',
  ml: 'fsharp',
  mli: 'fsharp',
  dart: 'dart',
  groovy: 'groovy',
  gradle: 'groovy',
  vb: 'vb',
  vbs: 'vb',

  // GraphQL/Protocol
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'protobuf',

  // Misc
  log: 'plaintext',
  txt: 'plaintext',
  text: 'plaintext',
  diff: 'diff',
  patch: 'diff',
  gitignore: 'ignore',
  dockerignore: 'ignore',
  npmignore: 'ignore',
  env: 'dotenv',
  makefile: 'makefile',
  cmake: 'cmake',
};

/**
 * Special filename mappings (case-insensitive)
 * For files without extensions or with special names
 */
export const filenameToLanguage: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gnumakefile: 'makefile',
  cmakelists: 'cmake',
  gemfile: 'ruby',
  rakefile: 'ruby',
  vagrantfile: 'ruby',
  jenkinsfile: 'groovy',
  '.gitignore': 'ignore',
  '.dockerignore': 'ignore',
  '.npmignore': 'ignore',
  '.env': 'dotenv',
  '.env.local': 'dotenv',
  '.env.development': 'dotenv',
  '.env.production': 'dotenv',
  '.editorconfig': 'ini',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
  'tsconfig.json': 'json',
  'package.json': 'json',
  'composer.json': 'json',
  'cargo.toml': 'ini',
  'go.mod': 'go',
  'go.sum': 'plaintext',
};

/**
 * Get Monaco Editor language identifier from file path
 * 
 * @param filePath - Full file path or filename
 * @returns Monaco language identifier (defaults to 'plaintext' if unknown)
 * 
 * @example
 * getLanguageFromPath('/home/user/app.tsx') // returns 'typescript'
 * getLanguageFromPath('Dockerfile') // returns 'dockerfile'
 * getLanguageFromPath('config.yaml') // returns 'yaml'
 */
export function getLanguageFromPath(filePath: string): string {
  // Extract filename from path
  const filename = filePath.split('/').pop()?.split('\\').pop() || filePath;
  const lowerFilename = filename.toLowerCase();

  // Check special filenames first
  if (filenameToLanguage[lowerFilename]) {
    return filenameToLanguage[lowerFilename];
  }

  // Check filename without extension for special cases
  const filenameWithoutExt = lowerFilename.split('.')[0];
  if (filenameToLanguage[filenameWithoutExt]) {
    return filenameToLanguage[filenameWithoutExt];
  }

  // Extract extension
  const parts = filename.split('.');
  if (parts.length > 1) {
    const extension = parts.pop()?.toLowerCase() || '';
    
    // Check extension mapping
    if (extensionToLanguage[extension]) {
      return extensionToLanguage[extension];
    }
  }

  // Default to plaintext
  return 'plaintext';
}

/**
 * Get all supported file extensions
 * 
 * @returns Array of supported file extensions (without dots)
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(extensionToLanguage);
}

/**
 * Get all supported Monaco languages
 * 
 * @returns Array of unique Monaco language identifiers
 */
export function getSupportedLanguages(): string[] {
  const languages = new Set([
    ...Object.values(extensionToLanguage),
    ...Object.values(filenameToLanguage),
  ]);
  return Array.from(languages).sort();
}

/**
 * Check if a file extension is supported
 * 
 * @param extension - File extension (with or without dot)
 * @returns true if the extension has a language mapping
 */
export function isExtensionSupported(extension: string): boolean {
  const ext = extension.startsWith('.') ? extension.slice(1) : extension;
  return ext.toLowerCase() in extensionToLanguage;
}
