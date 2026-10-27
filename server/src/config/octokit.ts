import { Octokit } from '@octokit/rest';

export const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
export const publicOctokit = new Octokit({ auth: process.env.GITHUB_SOURCE_TOKEN || undefined, request: { timeout: 15000 } });
