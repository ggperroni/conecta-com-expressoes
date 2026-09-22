/**
 * Tema claro/escuro.
 *
 * Fica num arquivo próprio, carregado no <head>, porque o tema precisa estar
 * decidido antes da primeira pintura: resolvido depois, um tema escuro salvo
 * apareceria só depois de um piscar claro.
 *
 * A preferência tem três valores — automático, claro e escuro —, e é o
 * automático que segue o sistema. O atributo data-theme do elemento raiz, ao
 * contrário, é sempre o tema já resolvido, de modo que a folha de estilo precise
 * de um único bloco escuro em vez de repetir a paleta dentro de uma media query.
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'conecta-com-expressoes:ajustes';
  var query = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;
  var preference = 'auto';

  /** @returns {'auto'|'light'|'dark'} qualquer outro valor cai no automático. */
  function normalize(value) {
    return value === 'light' || value === 'dark' ? value : 'auto';
  }

  function fromSystem() { return query && query.matches ? 'dark' : 'light'; }

  /** A preferência guardada junto dos outros ajustes. */
  function saved() {
    try {
      var settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return normalize(settings && settings.theme);
    } catch (error) { return 'auto'; }   /* ajustes ilegíveis: segue o sistema */
  }

  /**
   * Passa a valer a preferência dada e escreve o tema resolvido no documento.
   * @returns {'auto'|'light'|'dark'} a preferência normalizada, para quem guarda.
   */
  function apply(value) {
    preference = normalize(value);
    document.documentElement.dataset.theme = preference === 'auto' ? fromSystem() : preference;
    if (typeof CustomEvent === 'function') {
      root.dispatchEvent(new CustomEvent('themechange', {
        detail: { preference: preference, theme: current() }
      }));
    }
    return preference;
  }

  /** O tema em vigor. @returns {'light'|'dark'} */
  function current() { return document.documentElement.dataset.theme; }

  // Trocar o tema do sistema com a página aberta só tem efeito no automático.
  if (query && query.addEventListener) {
    query.addEventListener('change', function () {
      if (preference === 'auto') apply('auto');
    });
  }

  root.Theme = {
    STORAGE_KEY: STORAGE_KEY,
    apply: apply,
    current: current,
    normalize: normalize,
    preference: function () { return preference; }
  };

  apply(saved());
})(self);
