(function () {
  'use strict';

  if (window.__rfDynamicMenu) return;
  window.__rfDynamicMenu = true;

  function start() {
    const rf_menu = document.body.querySelector(".rf_menu");
    if (!rf_menu) return;

    const menuItems = rf_menu.querySelectorAll(".rf_menu__item");
    const menuBorder = rf_menu.querySelector(".rf_menu__border");
    let activeItem = rf_menu.querySelector(".active");

    function clickItem(item, index) {
      if (activeItem === item) return;

      if (activeItem) {
        activeItem.classList.remove("active");
      }

      item.classList.add("active");
      activeItem = item;
      showTab(index);
      offsetMenuBorder(activeItem, menuBorder);
    }

    function showTab(index) {
      const bodies = document.querySelectorAll('.content__body');
      bodies.forEach((body, i) => {
        body.classList.toggle('active', i === index);
      });
    }

    function offsetMenuBorder(element, menuBorder) {
      if (!element || !menuBorder) return;
      const offsetActiveItem = element.getBoundingClientRect();
      const left = Math.floor(offsetActiveItem.left - rf_menu.offsetLeft - (menuBorder.offsetWidth - offsetActiveItem.width) / 2) + "px";
      menuBorder.style.transform = `translate3d(${left}, 0 , 0)`;
    }

    offsetMenuBorder(activeItem, menuBorder);

    menuItems.forEach((item, index) => {
      item.addEventListener("click", () => clickItem(item, index));
    });

    let resizeRaf = 0;
    window.addEventListener("resize", () => {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        offsetMenuBorder(activeItem, menuBorder);
        rf_menu.style.setProperty("--timeOut", "none");
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
