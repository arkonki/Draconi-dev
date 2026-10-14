import ts from 'typescript';

/**
 * Every English text a source file hands to the translator: `t('…')`, `tr('…')`, and both branches of
 * `t(condition ? '…' : '…')`. Used by the coverage test, so a text added to the code without a translation is caught.
 */
export function translationKeysIn(source: string, fileName = 'file.tsx'): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const keys = new Set<string>();
  const addFrom = (node: ts.Node | undefined) => {
    if (!node) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) keys.add(node.text);
    else if (ts.isConditionalExpression(node)) { addFrom(node.whenTrue); addFrom(node.whenFalse); }
    else if (ts.isParenthesizedExpression(node)) addFrom(node.expression);
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && (node.expression.text === 't' || node.expression.text === 'tr')) addFrom(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...keys];
}
