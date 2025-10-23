import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

export const searchController = async (req, res) => {
  const { searchTerm } = req.body;
  if (!searchTerm) {
    return res.status(400).json({ error: 'Search term is required' });
  }
  try {
    const { data } = await octokit.rest.search.repos({
      q: searchTerm,
      per_page: 5,
    });
    const filteredRepos = data.items.map((repo) => ({
      full_name: repo.full_name,
      description: repo.description,
    }));
    res.json(filteredRepos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch repos' });
  }
};