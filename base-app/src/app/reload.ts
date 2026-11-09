/* The one place the app reloads the page, so a test can replace it (jsdom cannot navigate). */
export function reloadApp(): void {
  window.location.reload();
}
