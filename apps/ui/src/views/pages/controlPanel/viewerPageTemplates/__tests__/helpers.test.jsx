import { describe, it, expect, vi } from 'vitest';

import { tabOptions, handleTemplateChange } from '../helpers';

describe('viewerPageTemplates helpers', () => {
  it('tabOptions exposes Free + Premium with icons + captions', () => {
    expect(tabOptions).toHaveLength(2);
    expect(tabOptions[0].label).toBe('Free Templates');
    expect(tabOptions[1].label).toBe('Premium Templates');
    expect(tabOptions[0].icon).toBeDefined();
    expect(tabOptions[1].icon).toBeDefined();
  });

  it('handleTemplateChange picks the matching template by title and base64-encodes the content', () => {
    const setSelectedTemplate = vi.fn();
    const setSelectedTemplateBase64 = vi.fn();
    const templates = [
      { title: 'Bare', content: '<html>bare</html>' },
      { title: 'Festive', content: '<html>fest</html>' }
    ];
    handleTemplateChange(null, { label: 'Festive' }, templates, setSelectedTemplate, setSelectedTemplateBase64);
    expect(setSelectedTemplate).toHaveBeenCalledWith({ label: 'Festive' });
    const expected = `data:text/html;base64,${btoa('<html>fest</html>')}`;
    expect(setSelectedTemplateBase64).toHaveBeenCalledWith(expected);
  });

  it('handleTemplateChange is a no-op when nothing matches', () => {
    const setSelectedTemplate = vi.fn();
    const setSelectedTemplateBase64 = vi.fn();
    handleTemplateChange(null, { label: 'Nope' }, [{ title: 'A', content: 'x' }], setSelectedTemplate, setSelectedTemplateBase64);
    expect(setSelectedTemplate).not.toHaveBeenCalled();
    expect(setSelectedTemplateBase64).not.toHaveBeenCalled();
  });
});
