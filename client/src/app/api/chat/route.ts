
import { google } from '@ai-sdk/google';
import { streamText, generateText, convertToModelMessages } from 'ai';
import { Octokit } from '@octokit/rest';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const { messages } = await req.json();

        // Resolve context from Headers or Referer
        const owner = req.headers.get('x-github-owner') || parseReferer(req.headers.get('referer'))?.owner;
        const repo = req.headers.get('x-github-repo') || parseReferer(req.headers.get('referer'))?.repo;

        if (!owner || !repo) {
            console.error('API/Chat: Missing owner or repo context');
            return new Response('Missing owner or repo', { status: 400 });
        }

        const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

        // ... (previous setup keys/Octokit)

        // 0. Fetch Repo Structure (Context Injection)
        let fileTree = '';
        try {
            const { data: treeData } = await octokit.git.getTree({
                owner,
                repo,
                tree_sha: 'HEAD',
                recursive: 'true',
            });

            // Limit to top 200 files to save context, prioritize root and src
            fileTree = treeData.tree
                .filter(item => item.type === 'blob' || item.type === 'tree')
                .map(item => item.path)
                .slice(0, 300)
                .join('\n');
        } catch (e) {
            console.error('API/Chat: Failed to fetch repo tree', e);
            fileTree = '(File tree unavailable)';
        }

        // Phase 1: Reasoning Step (Manual Loop)
        const systemPrompt = `
You are an expert developer assistant for the repository ${owner}/${repo}.
You have access to the codebase via tools.
Your goal is to answer the user's question accurately by exploring the code.

## Repository Structure (Top Files)
${fileTree}

## Available Tools
1. ACTION: LIST_FILES(path=".")
   - Lists files in a directory.
2. ACTION: READ_FILE(path="src/index.js")
   - Reads the content of a file.

## Rules
1. To use a tool, output ONLY the ACTION command. checking regex: /ACTION:\\s*[A-Z_]+\\(path="[^"]+"\\)/
2. Use the provided "Repository Structure" to find the correct paths. Do NOT guess paths.
3. If you have enough information, just answer the user directly (do NOT use ACTION).
4. Do NOT provide explanations "I will now list..." before the ACTION.
5. When you receive an OBSERVATION, use it to reason about the next step.

## Example Session
User: What is in the src directory?
Assistant: ACTION: LIST_FILES(path="src")
User: OBSERVATION: [ "app", "components", "utils" ]
Assistant: The src directory contains app, components, and utils.
`;

        // Normalize messages for SDK
        let currentMessages = await convertToModelMessages(messages);

        let step = 0;
        const maxSteps = 10;

        // Manual ReAct Loop
        while (step < maxSteps) {
            console.log(`API/Chat: ReAct Step ${step + 1}`);

            // Ask the model what to do next
            const reasoning = await generateText({
                model: google('gemma-3-27b-it'),
                system: systemPrompt,
                messages: currentMessages,
            });

            const responseText = reasoning.text.trim();
            console.log(`API/Chat: Step ${step + 1} Output:`, responseText);

            // Check for ACTION patterns (Case insensitive, flexible spaces)
            const listFilesMatch = responseText.match(/ACTION:\s*LIST_FILES\(path="([^"]+)"\)/i);
            const readFileMatch = responseText.match(/ACTION:\s*READ_FILE\(path="([^"]+)"\)/i);

            if (listFilesMatch || readFileMatch) {
                let toolResult = '';
                let toolName = '';

                // Execute Tool
                try {
                    if (listFilesMatch) {
                        toolName = 'LIST_FILES';
                        const path = listFilesMatch[1];
                        console.log(`API/Chat: Executing ${toolName} for ${path}`);
                        const { data } = await octokit.repos.getContent({ owner, repo, path });
                        if (Array.isArray(data)) {
                            toolResult = JSON.stringify(data.map(i => i.name));
                        } else {
                            toolResult = 'Error: Path is a file, not a directory.';
                        }
                    } else if (readFileMatch) {
                        toolName = 'READ_FILE';
                        const path = readFileMatch[1];
                        console.log(`API/Chat: Executing ${toolName} for ${path}`);
                        const { data } = await octokit.repos.getContent({ owner, repo, path });
                        if ('content' in data && data.encoding === 'base64') {
                            const content = atob(data.content);
                            toolResult = content.slice(0, 15000) + (content.length > 15000 ? '\n...[truncated]' : '');
                        } else {
                            toolResult = 'Error: File not found or is binary.';
                        }
                    }
                } catch (e: any) {
                    toolResult = `Error executing tool: ${e.message}`;
                }

                console.log(`API/Chat: ${toolName} Result Length: ${toolResult.length}`);

                currentMessages.push({ role: 'assistant', content: responseText });
                currentMessages.push({ role: 'user', content: `OBSERVATION from ${toolName}: ${toolResult}` });

                step++;
            } else {
                // No action detected, break loop and stream final response
                console.log('API/Chat: No action detected, proceeding to final response.');
                break;
            }
        }

        // Final Stream
        console.log('API/Chat: Streaming final response');
        const result = streamText({
            model: google('gemma-3-27b-it'),
            // Explicitly forbid tools in the final response to prevent leaks
            system: systemPrompt + "\n\nCRITICAL: You are now answering the user. Do NOT use TOOLS. Just provide the final answer.",
            messages: currentMessages,
        });

        // @ts-ignore
        return result.toUIMessageStreamResponse();
    } catch (error) {
        console.error('API/Chat: Internal Handler Error', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}

function parseReferer(referer: string | null) {
    if (!referer) return null;
    try {
        const url = new URL(referer);
        const parts = url.pathname.split('/'); // /docs/:owner/:repo/...
        if (parts[1] === 'docs' && parts.length >= 4) {
            return { owner: parts[2], repo: parts[3] };
        }
    } catch (e) { /* ignore */ }
    return null;
}
