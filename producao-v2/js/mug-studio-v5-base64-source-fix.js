const BUILD = '20260822-canecas-v5-base64-source-fix-v1';
const INSTALLED = '__daMugStudioV5Base64SourceFix';

function install() {
  if (window[INSTALLED] === BUILD) return;
  window[INSTALLED] = BUILD;

  const descriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  if (!descriptor?.get || !descriptor?.set) return;

  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    get() {
      return descriptor.get.call(this);
    },
    set(value) {
      let nextValue = value;
      if (typeof nextValue === 'string' && /^data:image\//i.test(nextValue)) {
        nextValue = nextValue.replace(/\?_mug_v5=\d+-\d+$/i, '');
      }
      return descriptor.set.call(this, nextValue);
    },
  });
}

install();

export { install };
