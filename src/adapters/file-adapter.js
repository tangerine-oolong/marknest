/* BMO adapter: file —— 网页形态。数据来自用户导出的书签 HTML，结果导出成 HTML 由用户导回浏览器。
   没有写回浏览器的能力（普通网页做不到），所以 canApply = false。 */
window.BMO = window.BMO || {};

BMO.FileAdapter = (function () {
  const KEY = 'bmo:progress';
  const mem = {};
  let canStore = false;
  try { localStorage.setItem('__bmo_probe', '1'); localStorage.removeItem('__bmo_probe'); canStore = true; }
  catch (e) { canStore = false; }

  const storage = {
    ok: canStore,
    get(k) { try { return canStore ? localStorage.getItem(k) : (mem[k] || null); } catch (e) { return mem[k] || null; } },
    set(k, v) { try { canStore ? localStorage.setItem(k, v) : (mem[k] = v); } catch (e) { mem[k] = v; } },
    remove(k) { try { canStore ? localStorage.removeItem(k) : delete mem[k]; } catch (e) { delete mem[k]; } },
  };

  /** 弹出文件选择框，返回文本 */
  function pick(accept) {
    return new Promise((resolve, reject) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept || '.html,.htm,.json,text/html,application/json';
      inp.style.display = 'none';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) { reject(new Error('未选择文件')); return; }
        const r = new FileReader();
        r.onload = () => { resolve({ name: f.name, text: String(r.result) }); inp.remove(); };
        r.onerror = () => { reject(new Error('读取文件失败')); inp.remove(); };
        r.readAsText(f, 'utf-8');
      };
      document.body.appendChild(inp);
      inp.click();
      setTimeout(() => inp.remove(), 60000);
    });
  }

  function fromHtml(text) {
    const { roots, warnings } = BMO.Parse.html(text);
    const state = BMO.Model.fromTree(roots, { source: 'file' });
    state.items.forEach(i => { i.used = null; i.visits = null; });
    const hasUsage = BMO.Tags.refresh(state, { usage: false });
    state.hasUsage = false;
    state.snapshot = null;
    return { state, warnings };
  }

  function fromJson(text) {
    const o = BMO.Export.fromJson(text);
    const state = BMO.Model.clone(o);
    state.source = state.source || 'file';
    BMO.Tags.refresh(state, { usage: !!state.hasUsage });
    return { state, warnings: [] };
  }

  const saveDraft = state => storage.set(KEY, BMO.Export.json(state));
  const loadDraft = () => { const s = storage.get(KEY); return s ? fromJson(s) : null; };
  const clearDraft = () => storage.remove(KEY);
  const hasDraft = () => !!storage.get(KEY);

  return {
    name: 'file', canApply: false, storageOk: canStore, storage,
    pick, fromHtml, fromJson, saveDraft, loadDraft, clearDraft, hasDraft,
  };
})();
