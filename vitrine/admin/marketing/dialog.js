export function closeMarketingDialog(dialog) {
  try {
    dialog.close();
  } catch {
    // A dialog may already be closed; remove it from the document either way.
  }
  dialog.remove();
}
