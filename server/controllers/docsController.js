import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

// GET /api/docs/:owner/:repo/meta.json
export const getDocController = async (req, res) => {
  const { owner, repo } = req.params;
  try {
    // The documentation storage repo (e.g. shinymacktest/gitdex-docs)
  const docsRepoOwner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME;
  const docsRepo = process.env.DOCS_REPO_NAME || 'gitdex-docs';

    const { data: metaData } = await octokit.rest.repos.getContent({
      owner: docsRepoOwner,
      repo: docsRepo,
      path: `docs/${owner}/${repo}/meta.json`,
      // request raw so we can parse content directly
      mediaType: { format: 'raw' },
    });

    // If we got here, the meta.json exists
    try {
      // metaData will be raw content string when mediaType.format='raw'
      const parsed = typeof metaData === 'string' ? JSON.parse(metaData) : metaData;
      return res.json(parsed);
    } catch (e) {
      // If parsing fails, still return success but empty meta
      return res.json({});
    }
  } catch (error) {
    // If file not found, return 404 so callers can treat as not-indexed
    return res.status(404).json({ error: 'Doc not found' });
  }
};

// GET /api/docs/:owner/:repo/files -> return meta + all files under docs/{owner}/{repo}
export const getDocsFiles = async (req, res) => {
  const { owner, repo } = req.params;
  try {
    const docsRepoOwner = process.env.DOCS_REPO_OWNER || process.env.GITHUB_USERNAME;
    const docsRepo = process.env.DOCS_REPO_NAME || 'gitdex-docs';

    // fetch meta.json
    const { data: metaData } = await octokit.rest.repos.getContent({
      owner: docsRepoOwner,
      repo: docsRepo,
      path: `docs/${owner}/${repo}/meta.json`,
    });

    // fetch tree and filter for this docs path
    const { data: treeData } = await octokit.rest.git.getTree({
      owner: docsRepoOwner,
      repo: docsRepo,
      tree_sha: 'main',
      recursive: 'true',
    });

    const docsPath = `docs/${owner}/${repo}/`;
    const docsFiles = treeData.tree.filter(item => item.path.startsWith(docsPath) && item.type === 'blob');

    const files = await Promise.all(
      docsFiles.map(async (file) => {
        const { data } = await octokit.rest.repos.getContent({
          owner: docsRepoOwner,
          repo: docsRepo,
          path: file.path,
        });

        let content = '';
        if ('content' in data && typeof data.content === 'string') {
          content = Buffer.from(data.content, 'base64').toString();
        }
        return { path: file.path.replace(docsPath, ''), content };
      })
    );

    return res.json({ meta: metaData, files });
  } catch (error) {
    console.error('getDocsFiles error', error);
    return res.status(500).json({ error: 'Failed to fetch docs files' });
  }
};