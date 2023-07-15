import './prism-patch';
import { basename, extname } from 'node:path';
import {
  Disposable,
  ExtensionContext,
  commands,
  workspace,
  events,
} from 'coc.nvim';
import { develop, createMarkmap } from 'markmap-cli';
// Note: only CJS is supported by coc.nvim
import debounce from 'lodash.debounce';

const disposables: Disposable[] = [];

async function getFullText(): Promise<string> {
  const doc = await workspace.document;
  return doc.textDocument.getText();
}

async function getSelectedText(): Promise<string> {
  const doc = await workspace.document;
  const range = await workspace.getSelectedRange('v', doc);
  return range ? doc.textDocument.getText(range) : '';
}

async function startDevelop() {
  if (disposables.length > 0) {
    for (const disposable of disposables) {
      disposable.dispose();
    }
    disposables.length = 0;
  }
  const devServer = await develop(undefined, {
    open: true,
    toolbar: true,
    offline: true,
  });
  const { nvim } = workspace;
  const buffer = await nvim.buffer;
  const updateContent = async () => {
    const lines = await buffer.getLines();
    devServer.provider.setContent(lines.join('\n'));
  };
  const handleTextChange = debounce((bufnr: number) => {
    if (buffer.id !== bufnr) {
      return;
    }
    return updateContent();
  }, 500);
  const handleCursor = debounce((bufnr: number) => {
    if (buffer.id !== bufnr) {
      return;
    }
    devServer.provider.setCursor(events.cursor.lnum - 1);
  }, 300);
  disposables.push(Disposable.create(() => devServer.close()));
  disposables.push(events.on('TextChanged', handleTextChange));
  disposables.push(events.on('TextChangedI', handleTextChange));
  disposables.push(events.on('CursorMoved', handleCursor));
  disposables.push(events.on('CursorMovedI', handleCursor));
  updateContent();
}

async function createMarkmapFromVim(
  content: string,
  options?: { watch?: boolean; offline?: boolean },
): Promise<void> {
  const mergedOptions = {
    watch: false,
    offline: false,
    ...options,
  };
  if (mergedOptions.watch) {
    return startDevelop();
  }
  const { nvim } = workspace;
  const input = (await nvim.eval('expand("%:p")')) as string;
  const name = basename(input, extname(input));
  createMarkmap({
    ...options,
    content,
    output: name && `${name}.html`,
    open: true,
    toolbar: true,
    offline: mergedOptions.offline,
  });
}

export function activate(context: ExtensionContext): void {
  // const config = workspace.getConfiguration('markmap');

  context.subscriptions.push(
    workspace.registerKeymap(
      ['n'],
      'markmap-create',
      async () => {
        const content = await getFullText();
        await createMarkmapFromVim(content);
      },
      { sync: false },
    ),
  );

  context.subscriptions.push(
    workspace.registerKeymap(
      ['v'],
      'markmap-create-v',
      async () => {
        const content = await getSelectedText();
        await createMarkmapFromVim(content);
      },
      { sync: false },
    ),
  );

  context.subscriptions.push(
    commands.registerCommand('markmap.create', async (...args: string[]) => {
      const content = await getFullText();
      const options = {
        offline: args.includes('--offline'),
      };
      await createMarkmapFromVim(content, options);
    }),
  );

  context.subscriptions.push(
    commands.registerCommand('markmap.watch', async () => {
      const content = await getFullText();
      await createMarkmapFromVim(content, { watch: true });
    }),
  );
}
