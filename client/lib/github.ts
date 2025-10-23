import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ 
  auth: process.env.GITHUB_TOKEN 
});

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
    const docsRepo = 'gitdex-docs';
    const docsPath = `docs/${owner}/${repo}`;
    
    console.log(`Fetching docs for ${owner}/${repo} from ${docsRepo}/${docsPath}`);
    
    // Fetch the meta.json file
    console.log(`Fetching meta file from ${docsPath}/meta.json`);
    const { data: metaData } = await octokit.rest.repos.getContent({
      owner: process.env.GITHUB_USERNAME || 'your-github-username',
      repo: docsRepo,
      path: `${docsPath}/meta.json`,
    });
    
    // Handle meta content
    let metaContent = {};
    if ('content' in metaData && typeof metaData.content === 'string') {
      try {
        metaContent = JSON.parse(Buffer.from(metaData.content, 'base64').toString());
      } catch (e) {
        console.error('Error parsing meta JSON:', e);
      }
    } else if ('title' in metaData || 'description' in metaData) {
      // This is the direct JSON object
      metaContent = metaData;
    }
    
    // console.log('=== META CONTENT ===');
    // console.log(JSON.stringify(metaContent, null, 2));
    // console.log('=== END META CONTENT ===');
    
    // Fetch all files in the directory recursively
    console.log(`Fetching tree data for ${docsRepo}`);
    const { data: treeData } = await octokit.rest.git.getTree({
      owner: process.env.GITHUB_USERNAME || 'your-github-username',
      repo: docsRepo,
      tree_sha: 'main',
      recursive: "true",
    });
    
    console.log(`Found ${treeData.tree.length} total files in repository`);
    
    // Filter files in our docs path
    const docsFiles = treeData.tree.filter(
      item => item.path.startsWith(`${docsPath}/`) && item.type === 'blob'
    );
    
    console.log(`Found ${docsFiles.length} files in docs path: ${docsPath}`);
    console.log('Files:', docsFiles.map(f => f.path));
    
    // Fetch content for each file
    const filesContent = await Promise.all(
      docsFiles.map(async file => {
        console.log(`Fetching content for ${file.path}`);
        
        // Don't use raw format to get consistent response
        const { data } = await octokit.rest.repos.getContent({
          owner: process.env.GITHUB_USERNAME || 'your-github-username',
          repo: docsRepo,
          path: file.path,
        });
        
        let content = '';
        
        // All responses should have 'content' property when not using raw format
        if ('content' in data && typeof data.content === 'string') {
          content = Buffer.from(data.content, 'base64').toString();
          
        //   console.log(`=== CONTENT PREVIEW for ${file.path} ===`);
        //   console.log(content.substring(0, 200));
        //   if (content.length > 200) {
        //     console.log('... (truncated)');
        //   }
        //   console.log('=== END CONTENT PREVIEW ===');
        } else {
          console.log(`No content found for ${file.path}`);
        }
        
        return {
          path: file.path.replace(`${docsPath}/`, ''),
          content,
        };
      })
    );
    
    console.log(`Successfully fetched ${filesContent.length} files`);
    
    return {
      index: '', // No index file in the new structure
      meta: metaContent,
      files: filesContent,
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