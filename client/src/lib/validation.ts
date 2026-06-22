// client/lib/validation.ts
export function validateGitHubUrl(url: string): { valid: boolean; error?: string } {
  if (!url || url.trim() === '') {
    return { valid: false, error: "GitHub URL is required" };
  }

  const trimmedUrl = url.trim();
  
  // Check for GitHub URL format
  const githubRegex = /^https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\/)?$/;
  if (!githubRegex.test(trimmedUrl)) {
    return { 
      valid: false, 
      error: "Invalid GitHub URL format. Use https://github.com/owner/repo" 
    };
  }

  return { valid: true };
}

export function extractOwnerRepoFromUrl(url: string): { valid: boolean; owner?: string; repo?: string; error?: string } {
  if (!url || url.trim() === '') {
    return { valid: false, error: "URL is required" };
  }

  const trimmedUrl = url.trim();
  
  // Handle GitHub URLs
  const githubRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:\/)?/;
  const match = trimmedUrl.match(githubRegex);
  
  if (match) {
    return { 
      valid: true, 
      owner: match[1],
      repo: match[2].replace('.git', '')
    };
  }
  
  return { 
    valid: false, 
    error: "Invalid GitHub URL format. Use https://github.com/owner/repo" 
  };
}