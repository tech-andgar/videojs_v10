export class PipSourceElement extends HTMLElement {
  static readonly tagName = 'pip-source';

  get src(): string {
    return this.getAttribute('src') || '';
  }

  get lang(): string {
    return this.getAttribute('data-lang') || '';
  }

  get label(): string {
    return this.getAttribute('label') || '';
  }
}
