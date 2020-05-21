import * as vscode from 'vscode';
import { ContextWord, ContextWordType, getContextWord } from './ContextWord';
import { createNoteOnGoToDefinitionWhenMissing, useUniqueFilenames } from './MarkdownNotebook';
import { basename, dirname, resolve } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { titleCaseFilename } from './utils';

// TODO: read this!
// https://stackoverflow.com/questions/54285472/vscode-how-to-automatically-jump-to-proper-definition
export class MarkdownDefinitionProvider implements vscode.DefinitionProvider {
  public async provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken
  ) {
    // console.debug('provideDefinition');

    const contextWord = getContextWord(document, position);
    // debugContextWord(contextWord);
    if (contextWord.type != ContextWordType.WikiLink) {
      // console.debug('getContextWord was not WikiLink');
      return [];
    }
    if (!contextWord.hasExtension) {
      // console.debug('getContextWord does not have file extension');
      return [];
    }

    // TODO: parameterize extensions. return if we don't have a filename and we require extensions
    // const markdownFileRegex = /[\w\.\-\_\/\\]+\.(md|markdown)/i;
    const selectedWord = contextWord.word;
    // console.debug('selectedWord', selectedWord);
    let files: Array<vscode.Uri> = [];
    // selectedWord might be either:
    // a basename for a unique file in the workspace
    // or, a relative path to a file
    // Since, selectedWord is just a string of text from a document,
    // there is no guarantee useUniqueFilenames will tell us
    // it is not a relative path.
    // However, only check for basenames in the entire project if:
    if (useUniqueFilenames()) {
      const filename = selectedWord;
      // there should be exactly 1 file with name = selectedWord
      files = (await vscode.workspace.findFiles('**/*')).filter((f) => {
        return basename(f.fsPath) == filename;
      });
    }
    // If we did not find any files in the workspace,
    // see if a file exists at the relative path:
    if (files.length == 0) {
      const relativePath = selectedWord;
      let fromDir = dirname(document.uri.path.toString());
      const absPath = resolve(fromDir, relativePath);
      if (existsSync(absPath)) {
        const f = vscode.Uri.file(absPath);
        files.push(f);
      }
    }

    // else, create the file
    if (files.length == 0) {
      const path = MarkdownDefinitionProvider.createMissingNote(contextWord);
      if (path !== undefined) {
        files.push(vscode.Uri.parse(`file://${path}`));
      }
    }

    const p = new vscode.Position(0, 0);
    return files.map((f) => new vscode.Location(f, p));
  }

  static createMissingNote = (contextWord: ContextWord): string | undefined => {
    // don't create new files if contextWord is a Tag
    if (contextWord.type != ContextWordType.WikiLink) {
      return;
    }
    let cfg = vscode.workspace.getConfiguration('vscodeMarkdownNotes');
    if (!createNoteOnGoToDefinitionWhenMissing()) {
      return;
    }
    const filename = vscode.window.activeTextEditor?.document.fileName;
    if (filename !== undefined) {
      if (!useUniqueFilenames()) {
        vscode.window.showWarningMessage(
          `createNoteOnGoToDefinitionWhenMissing only works when vscodeMarkdownNotes.workspaceFilenameConvention = 'uniqueFilenames'`
        );
        return;
      }
      // add an extension if one does not exist
      let mdFilename = contextWord.word.match(/\.(md|markdown)$/i)
        ? contextWord.word
        : `${contextWord.word}.md`;
      // by default, create new note in same dir as the current document
      // TODO: could convert this to an option (to, eg, create in workspace root)
      const path = `${dirname(filename)}/${mdFilename}`;
      const title = titleCaseFilename(contextWord.word);
      writeFileSync(path, `# ${title}\n\n`);
      return path;
    }
  };
}
