import { Octokit } from '@octokit/rest';

export interface DocFile {
    path: string;
    content: string;
}

export interface DocsStructure {
    index: string;
    meta: any;
    files: DocFile[];
}

export async function getGithubDocs(owner: string, repo: string): Promise<DocsStructure> {
    try {
        const docsRepoOwner = process.env.GITHUB_USERNAME || 'shinymacktest';
        const docsRepo = 'gitdex-docs';
        const docsPath = `docs/${owner}/${repo}`;
        const branch = 'main';
        const token = process.env.GITHUB_TOKEN;

        const fetchFile = async (path: string) => {
            const headers: HeadersInit = {};
            if (token) {
                headers['Authorization'] = `token ${token}`;
            }

            const res = await fetch(`https://raw.githubusercontent.com/${docsRepoOwner}/${docsRepo}/${branch}/${path}`, { headers });
            if (!res.ok) return null;
            return res.text();
        };

        const octokit = new Octokit({ auth: token });
        const { data: treeData } = await octokit.rest.git.getTree({
            owner: docsRepoOwner,
            repo: docsRepo,
            tree_sha: branch,
            recursive: "true",
        });

        const docsFiles = treeData.tree.filter(
            item => item.path.startsWith(`${docsPath}/`) && item.type === 'blob'
        );

        const filesContent = await Promise.all(
            docsFiles.map(async file => {
                const content = await fetchFile(file.path);
                return { path: file.path.replace(`${docsPath}/`, ''), content: content || '' };
            })
        );

        const metaFile = filesContent.find(f => f.path === 'meta.json');
        let metaContent = {};
        if (metaFile) {
            try { metaContent = JSON.parse(metaFile.content); } catch (e) { }
        }

        return {
            index: '',
            meta: metaContent,
            files: filesContent.filter(f => f.path !== 'meta.json'),
        };
    } catch (error) {
        console.error('Error fetching GitHub docs:', error);
        return {
            index: '',
            meta: {},
            files: [],
        };
    }
}