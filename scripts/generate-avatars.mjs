import { mkdir, writeFile } from 'node:fs/promises';
import { Avatar, Style } from '@dicebear/core';
import definition from '@dicebear/styles/notionists.json' with { type: 'json' };

// Notionists artwork by Zoish, CC0 1.0. Generate locally; no customer data leaves the app.
const style = new Style(definition);
const directory = new URL('../public/images/avatars/', import.meta.url);
await mkdir(directory, { recursive: true });
const colors = ['e5eee7', 'f4e9dc', 'e4edf3', 'eee8f2'];
for (let index = 0; index < 12; index++) {
  const avatar = new Avatar(style, {
    seed: `sahar-buyer-${index + 1}`,
    size: 128,
    backgroundColor: [colors[index % colors.length]],
  });
  await writeFile(new URL(`buyer-${index + 1}.svg`, directory), avatar.toString());
}
console.log('Generated 12 local buyer avatars.');
