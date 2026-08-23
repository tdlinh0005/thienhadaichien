# Orbital Command UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hiện đại hoá toàn bộ UI vanilla JavaScript của Thiên Hà Đại Chiến thành Đài chỉ huy quỹ đạo, hoạt động tương đương ở solo và multiplayer, không đổi luật hoặc hợp đồng game.

**Architecture:** Giữ hai HTML shell và các facade JavaScript hiện hữu; bổ sung ngữ nghĩa, state giao diện ngắn hạn và renderer helpers trong U, còn APP chỉ điều phối tương tác. CSS một tệp cung cấp token/component/responsive; MP vẫn là adapter API/server-authoritative và chỉ bổ sung trạng thái trình bày. Tất cả hành vi được khoá bằng Playwright native assertions trong tools/test-mp-ui.mjs.

**Tech Stack:** HTML5 semantic, CSS custom properties, vanilla browser DOM, Node.js >=22.5, Playwright Chromium đã pin bởi đặc tả chất lượng, các test Node hiện hữu và tools/build.js.

**Spec:** docs/superpowers/specs/2026-08-23-ui-modernization-design.md

## Global Constraints

- Giữ gameplay, công thức, state/save schema, API, payload APP.lam, quyền server-authoritative, localStorage key/token, data-act, data-man, selector/ID đã có và nhãn sáu tài nguyên không đổi.
- Sáu tài nguyên luôn truy cập được là Kim Loại, Thạch Anh, Nhiên Liệu, Thực Phẩm, Galana, Kỹ Thuật; Điện và đồng hồ bảo trì là chỉ số vận hành bổ sung.
- Giữ URL /, /index.html, /motnguoi, /solo và việc mở trực tiếp root index.html bằng file://. Không thêm framework, bundler, import ESM, dependency runtime, font/network bắt buộc hoặc asset runtime.
- Giữ thứ tự tương đối các facade data, util, galaxy, combat, engine, fleet, actions, ui, app, main; bản multiplayer giữ cùng tám facade đầu rồi app và web/js/mp.js. Module nội bộ chỉ được chèn trước facade sở hữu nó qua manifest canonical của đặc tả chất lượng.
- PNG docs/superpowers/specs/assets/thdc-orbital-command-reference.png chỉ là tham chiếu thiết kế; không được link, tải hoặc đóng gói như asset runtime.
- Không hiển thị scheduler job state, metrics hoặc endpoint scheduler; UI chỉ phản ánh kết quả gameplay, lỗi HTTP và trạng thái kết nối hiện hữu.
- Vùng chạm tối thiểu 44 x 44 CSS px; keyboard, focus visible, WCAG AA, zoom 200%, prefers-reduced-motion và không cuộn ngang cấp trang là điều kiện toàn cục.
- Thực hiện sau khi interface của đặc tả chất lượng đã có: manifest nguồn, package/Playwright pin, npm run test:ui, npm run check:artifact và npm test mở rộng. Plan UI không sửa package.json, lockfile, manifest hay server loader.

---

## File Structure and Integration Order

| File | Trách nhiệm trong plan |
| --- | --- |
| index.html:13-75 | Shell solo semantic, command bar, landmark, drawer, dialog, toast và form khởi động. |
| web/index.html:13-92 | Shell multiplayer semantic, login/register tab/form, command bar và cùng contract DOM với solo. |
| css/style.css:3-221 | Token Đài chỉ huy quỹ đạo, component state, breakpoint desktop/tablet/mobile, focus/motion/overflow. |
| js/ui.js:20-1556 | State UI ngắn hạn, renderer shell, resource/menu, focus/draft/scroll preservation, renderer màn chung. |
| js/app.js:35-309 | Delegation, keyboard drawer/dialog, focus origin và action contract hiện có. |
| js/main.js:162-189 | Bootstrap solo gọi contract drawer mới, không đổi localStorage hay gameplay. |
| web/js/mp.js:16-648 | Adapter trạng thái mạng/loading/error/chat/bảng tin/tài khoản, vẫn chỉ gọi API gameplay hiện hữu. |
| tools/test-mp-ui.mjs:43-760 | Test native semantic/a11y, breakpoint, preservation, route, file://, MP và regression UI. |
| tools/build.js:1-39 và dist/*.html | Chỉ chạy/kiểm tra ở Task 10; build source thuộc đặc tả chất lượng, artifact sinh từ HTML/CSS/JS UI. |

Thứ tự chương trình bắt buộc là **Quality foundation Tasks 1–8 → durable scheduler → UI Tasks 1–10 → Quality module-split Tasks 9–12 → Quality CI/integration Tasks 13–14**. UI Task 10 phải hoàn tất trước Quality Task 12 (tách facade UI); không thực hiện hai task đồng thời nếu chúng cùng sửa tools/test-mp-ui.mjs hoặc js/ui.js.

### Task 1: Semantic shell cho solo và multiplayer

**Files:**
- Modify: index.html:13-75
- Modify: web/index.html:13-92
- Modify: tools/test-mp-ui.mjs:69-133, sau helper soHang

**Interfaces:**
- Consumes: Các ID hiện có man-khoidong, game, thanh-tren, tt-res, chon-ht, nut-menu, thanh-canh, menu, noidung, chan, chan-tt, hop-thoai, ht-td, ht-noi, toast; solo Save, multiplayer tt-net/Thoát và data-act/data-man.
- Produces: Cùng các ID trên, cộng nut-tongquan; nut-menu có aria-controls="menu" và aria-expanded; menu có nhãn navigation; noidung có tabindex="-1"; chan chứa trực tiếp chan-tt; hop-thoai có role="dialog", aria-modal="true", aria-labelledby="ht-td" và close data-act="dong-ht"; toast là live region.
- Produces: Form login/register và solo có label for theo đúng ID input; tab multiplayer có aria-controls, aria-selected và panel có role="tabpanel".

- [ ] **Step 1: Viết assertion shell đang thiếu**

  Thêm các helper dưới sau tools/test-mp-ui.mjs:129. Chúng dùng cùng ktra của test hiện hữu để test đỏ được báo bằng dòng bắt đầu bằng dấu ✗ và exit code 1 ở cuối file.

  ~~~js
  async function shellSemantic(page) {
    return await page.evaluate(function () {
      var menu = document.getElementById('menu');
      var modal = document.getElementById('hop-thoai');
      var button = document.getElementById('nut-menu');
      var footer = document.getElementById('chan');
      return {
        landmarks: ['header', 'nav', 'main', 'footer'].every(function (tag) {
          return !!document.querySelector(tag);
        }),
        mainTabindex: (document.getElementById('noidung') || {}).getAttribute('tabindex'),
        menuLabel: menu && menu.getAttribute('aria-label'),
        menuButtonControls: button && button.getAttribute('aria-controls'),
        menuButtonExpanded: button && button.getAttribute('aria-expanded'),
        modalRole: modal && modal.getAttribute('role'),
        modalLabel: modal && modal.getAttribute('aria-labelledby'),
        modalClose: !!document.querySelector('#hop-thoai [data-act="dong-ht"]'),
        footer: !!footer && footer.tagName === 'FOOTER',
        footerText: !!document.querySelector('#chan > #chan-tt'),
        toastLive: (document.getElementById('toast') || {}).getAttribute('aria-live'),
        soloSave: !!document.querySelector('[data-act="luu"]'),
        mpNet: !!document.getElementById('tt-net'),
        mpLogout: !!document.querySelector('[data-act="dangxuat"]')
      };
    });
  }

  async function ktraShellSemantic(page, ten, cheDo) {
    var s = await shellSemantic(page);
    ktra(s.landmarks, ten + ': có landmark header/nav/main/footer');
    ktra(s.mainTabindex === '-1', ten + ': main nhận focus chương trình');
    ktra(s.menuLabel === 'Điều hướng nhiệm vụ', ten + ': nav có tên');
    ktra(s.menuButtonControls === 'menu' && s.menuButtonExpanded === 'false',
      ten + ': nút drawer công bố trạng thái');
    ktra(s.modalRole === 'dialog' && s.modalLabel === 'ht-td' && s.modalClose,
      ten + ': hộp thoại có ngữ nghĩa');
    ktra(s.footer && s.footerText, ten + ': giữ #chan > #chan-tt');
    ktra(s.toastLive === 'polite', ten + ': toast là live region');
    if (cheDo === 'solo') ktra(s.soloSave, ten + ': có Save solo');
    else ktra(s.mpNet && s.mpLogout, ten + ': có #tt-net và Thoát multiplayer');
  }

  async function assertNativeA11y(page) {
    return await page.evaluate(function () {
      var bad = [];
      document.querySelectorAll('button').forEach(function (button) {
        if (!((button.innerText || '').trim() || button.getAttribute('aria-label'))) bad.push('button-name');
      });
      document.querySelectorAll('[role="dialog"]').forEach(function (dialog) {
        if (dialog.getAttribute('aria-modal') !== 'true' || !dialog.getAttribute('aria-labelledby')) bad.push('dialog');
      });
      return bad;
    });
  }
  ~~~

  Gọi await ktraShellSemantic(p1, 'multiplayer shell', 'multiplayer') ngay sau khi p1 đăng ký thành công và gọi await ktraShellSemantic(pSolo, 'solo shell', 'solo') ngay sau khi pSolo bấm #kd-tieptuc. Ngay sau đăng ký p1, thêm compatibility check server entrypoint sau; đây là assertion nền (có thể xanh trước redesign), còn assertion semantic ở trên là test đỏ của task này. Không coi /web/ là route chạy được.

  ~~~js
  var ctxAlias = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'vi-VN' });
  var pAlias = await ctxAlias.newPage();
  theoDoi('solo aliases', pAlias);
  await pAlias.goto(URL + '/', { waitUntil: 'domcontentloaded' });
  await pAlias.waitForFunction('window.APP && APP.mp === true', null, { timeout: 20000 });
  ktra(await pAlias.evaluate(function () { return APP.mp === true; }), '/ mở entrypoint multiplayer');
  await ktraShellSemantic(pAlias, 'shell / multiplayer', 'multiplayer');
  await pAlias.goto(URL + '/solo', { waitUntil: 'domcontentloaded' });
  await pAlias.waitForFunction('window.APP && APP.mp === false', null, { timeout: 20000 });
  ktra(await pAlias.evaluate(function () { return APP.mp === false; }), '/solo mở entrypoint solo');
  await ktraShellSemantic(pAlias, 'shell /solo', 'solo');
  await pAlias.goto(URL + '/motnguoi', { waitUntil: 'domcontentloaded' });
  await pAlias.waitForFunction('window.APP && APP.mp === false', null, { timeout: 20000 });
  ktra(await pAlias.evaluate(function () { return APP.mp === false; }), '/motnguoi mở entrypoint solo');
  await ktraShellSemantic(pAlias, 'shell /motnguoi', 'solo');
  await pAlias.goto(URL + '/index.html', { waitUntil: 'domcontentloaded' });
  await pAlias.waitForFunction('window.APP && APP.mp === true', null, { timeout: 20000 });
  ktra(await pAlias.evaluate(function () { return APP.mp === true; }), '/index.html mở entrypoint multiplayer');
  await ktraShellSemantic(pAlias, 'shell /index.html multiplayer', 'multiplayer');
  await ctxAlias.close();
  ~~~

- [ ] **Step 2: Chạy test để xác nhận đỏ**

  Run: node tools/test-mp-ui.mjs

  Expected: FAIL với các dòng như “multiplayer shell: nút drawer công bố trạng thái” và “hộp thoại có ngữ nghĩa”, vì HTML hiện tại không có các aria attribute đó.

- [ ] **Step 3: Đổi hai shell thành semantic contract mà không đổi ID/action**

  Trong cả hai HTML, giữ nguyên script URL/order và tất cả ID cũ. Thay phần tử shell hiện tại bằng đầy đủ contract dưới đây; hai biến thể chỉ khác dòng solo Save hoặc cặp multiplayer #tt-net/Thoát.

  ~~~html
  <header id="thanh-tren">
    <button id="nut-tongquan" class="tt-logo" type="button"
      data-act="man" data-man="tongquan">THIÊN HÀ ĐẠI CHIẾN</button>
    <section id="tt-res" class="tt-res" aria-label="Tình trạng đế quốc"></section>
    <!-- Dùng đúng một .tt-phu variant theo file, không đưa #tt-net vào solo hoặc Save vào multiplayer. -->
    <!-- index.html (solo) -->
    <div class="tt-phu">
      <label class="sr-only" for="chon-ht">Chọn hành tinh</label>
      <select id="chon-ht"></select>
      <button class="nut nho" id="nut-menu" type="button"
        aria-label="Mở điều hướng" aria-controls="menu" aria-expanded="false">☰</button>
      <button class="nut nho" type="button" data-act="luu">Lưu</button>
    </div>
    <!-- web/index.html (multiplayer) -->
    <div class="tt-phu">
      <label class="sr-only" for="chon-ht">Chọn hành tinh</label>
      <select id="chon-ht"></select>
      <button class="nut nho" id="nut-menu" type="button"
        aria-label="Mở điều hướng" aria-controls="menu" aria-expanded="false">☰</button>
      <span id="tt-net" role="status" aria-live="polite"></span>
      <button class="nut nho" type="button" data-act="dangxuat">Thoát</button>
    </div>
  </header>
  <section id="thanh-canh" aria-label="Cảnh báo đế quốc" aria-live="polite"></section>
  <div class="khung">
    <nav id="menu" aria-label="Điều hướng nhiệm vụ"></nav>
    <main id="noidung" tabindex="-1"></main>
  </div>
  <footer id="chan"><span id="chan-tt"></span></footer>
  <div id="hop-thoai" class="hop-thoai" style="display:none"
    role="dialog" aria-modal="true" aria-labelledby="ht-td">
    <div class="ht-trong" role="document">
      <div class="ht-dau">
        <h2 id="ht-td" tabindex="-1"></h2>
        <button class="nut nho" type="button" data-act="dong-ht">Đóng</button>
      </div>
      <div id="ht-noi"></div>
    </div>
  </div>
  <div id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
  ~~~

  Đặt role="status" aria-live="polite" aria-atomic="true" lên toast. Đổi label text-only của mọi input khởi động thành label for. Trong web/index.html, đặt role="tablist" cho kd-tab, role="tab" cùng aria-selected/aria-controls cho tab-dn/tab-dk, và role="tabpanel" cùng aria-labelledby cho form-dn/form-dk. Đặt kd-loi role="alert".

- [ ] **Step 4: Chạy test xanh và kiểm tra contract selector**

  Run: node tools/test-mp-ui.mjs

  Expected: PASS các assertion shell mới; các test cũ vẫn tìm được #thanh-tren, #nut-menu, #menu, #noidung, #tab-dk, #dn-mk và mọi data-act cũ.

  Run: rg -n 'data-act=|data-man=|id="(man-khoidong|game|thanh-tren|tt-res|chon-ht|nut-menu|menu|noidung|chan|chan-tt|hop-thoai|ht-td|ht-noi|toast|tt-net)"' index.html web/index.html

  Expected: tất cả ID/action contract cũ còn xuất hiện.

- [ ] **Step 5: Commit shell semantic**

  ~~~bash
  git add index.html web/index.html tools/test-mp-ui.mjs
  git commit -m "feat(ui): add semantic command shells"
  ~~~

### Task 2: Token Đài chỉ huy và layout đáp ứng

**Files:**
- Modify: css/style.css:3-221
- Modify: tools/test-mp-ui.mjs:621-644

**Interfaces:**
- Consumes: Các class cũ nut, panel, luoi, luoi2, tt-res, bang-cuon, chat-ds, hop-thoai, menu và mo-ra.
- Produces: Token --bg-space, --bg-command, --surface-1, --surface-2, --surface-raised, --border-subtle, --border-strong, --text-primary, --text-secondary, --text-muted, --text-inverse, --font-data, --signal-cyan, --signal-amber, --state-success, --state-warning, --state-danger và --state-info.
- Produces: Breakpoint desktop >=1200, tablet 768-1199 và mobile <768; CSS class menu-mo biểu thị drawer mở; class sr-only ẩn trực quan nhưng vẫn đọc được.

- [ ] **Step 1: Viết assertion token, touch target và không tràn ngang**

  Thêm helper vào test sau block mobile hiện có.

  ~~~js
  async function ktraKhungManHinh(page, width, height, ten) {
    await page.setViewportSize({ width: width, height: height });
    var kq = await page.evaluate(function () {
      var root = getComputedStyle(document.documentElement);
      var selectors = [
        window.matchMedia('(min-width: 1200px)').matches ? '#nut-tongquan' : '#nut-menu',
        '#menu [data-act="man"]', '#noidung .panel [data-act]'
      ];
      var hits = selectors.map(function (selector) {
        var control = document.querySelector(selector);
        if (!control) return null;
        var rect = control.getBoundingClientRect();
        return [Math.round(rect.width), Math.round(rect.height)];
      }).filter(Boolean);
      return {
        bg: root.getPropertyValue('--bg-space').trim(),
        cyan: root.getPropertyValue('--signal-cyan').trim(),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        hits: hits
      };
    });
    ktra(!!kq.bg && !!kq.cyan, ten + ': có token bề mặt và tín hiệu');
    ktra(!kq.overflow, ten + ': không cuộn ngang cấp trang');
    ktra(kq.hits.length === 3 && kq.hits.every(function (hit) {
      return hit[0] >= 44 && hit[1] >= 44;
    }), ten + ': command, menu và action panel đều đạt 44 × 44px');
  }

  function lum(rgb) {
    var parts = String(rgb).match(/\d+(?:\.\d+)?/g);
    if (!parts || parts.length < 3) return 0;
    var channels = parts.slice(0, 3).map(function (n) {
      n = Number(n) / 255;
      return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }
  async function mucTrongVisualViewport(page, selector) {
    var target = page.locator(selector).first();
    await target.scrollIntoViewIfNeeded();
    var evidence = await target.evaluate(function (el) {
      /* DOMRect và offset visualViewport đều là CSS px trong hệ layout viewport. */
      var rect = el.getBoundingClientRect(), viewport = window.visualViewport;
      var bounds = {
        left: viewport.offsetLeft,
        top: viewport.offsetTop,
        right: viewport.offsetLeft + viewport.width,
        bottom: viewport.offsetTop + viewport.height
      };
      var inside = rect.left >= bounds.left && rect.top >= bounds.top &&
        rect.right <= bounds.right && rect.bottom <= bounds.bottom;
      var style = getComputedStyle(el);
      return {
        visual: { scale: viewport.scale, width: viewport.width, height: viewport.height,
          offsetLeft: viewport.offsetLeft, offsetTop: viewport.offsetTop },
        layoutViewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
        layoutRect: [rect.left, rect.top, rect.right, rect.bottom],
        visualBoundsInLayout: [bounds.left, bounds.top, bounds.right, bounds.bottom],
        rendered: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0,
        inside: inside
      };
    });
    await target.click({ trial: true }); // Playwright xác nhận hit target thật, không dispatch action gameplay.
    evidence.interactable = true;
    return evidence;
  }
  async function ktraMotionZoomContrast(page) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    var kq = await page.evaluate(function () {
      var pairs = [
        ['--text-primary', '--surface-1'], ['--text-secondary', '--bg-space'],
        ['--state-danger', '--surface-1'], ['--signal-cyan', '--bg-command']
      ].map(function (names) {
        var probe = document.createElement('span');
        probe.style.color = 'var(' + names[0] + ')';
        probe.style.backgroundColor = 'var(' + names[1] + ')';
        document.body.appendChild(probe);
        var style = getComputedStyle(probe), pair = [style.color, style.backgroundColor];
        probe.remove();
        return pair;
      });
      var transition = parseFloat(getComputedStyle(document.getElementById('menu')).transitionDuration) || 0;
      return { pairs: pairs, transition: transition };
    });
    var menuButton = page.locator('#nut-menu'), reachedMenuWithTab = false;
    await page.evaluate(function () {
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    });
    for (var tabCount = 0; tabCount < 12; tabCount++) {
      await page.keyboard.press('Tab');
      if (await menuButton.evaluate(function (el) { return document.activeElement === el; })) {
        reachedMenuWithTab = true;
        break;
      }
    }
    await page.keyboard.press('Shift+Tab');
    var movedBackByShiftTab = await menuButton.evaluate(function (el) {
      var active = document.activeElement;
      return active !== el && !!active && active.matches('button,input,select,textarea,[href],[tabindex]:not([tabindex="-1"])');
    });
    await page.keyboard.press('Tab');
    var focus = await menuButton.evaluate(function (el) {
      var style = getComputedStyle(el);
      return {
        active: document.activeElement === el,
        matchesFocusVisible: el.matches(':focus-visible'),
        outlineWidth: parseFloat(style.outlineWidth) || 0,
        outlineStyle: style.outlineStyle,
        outlineColor: style.outlineColor
      };
    });
    await page.setViewportSize({ width: 1024, height: 768 });
    var cdp = await page.context().newCDPSession(page), zoomTargets = null;
    try {
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
      await page.waitForFunction(function () {
        return !!window.visualViewport && window.visualViewport.scale >= 1.99;
      }, null, { timeout: 5000 });
      var commandAtZoom = await mucTrongVisualViewport(page, '#nut-menu');
      await menuButton.click();
      var navigationAtZoom = await mucTrongVisualViewport(page, '#menu [data-man]');
      await menuButton.click();
      var actionAtZoom = await mucTrongVisualViewport(page, '#noidung [data-act="doithue"]');
      zoomTargets = [commandAtZoom, navigationAtZoom, actionAtZoom];
    } finally {
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    ktra(kq.transition <= 0.01, 'reduced motion rút transition xuống tối đa 0.01s');
    ktra(reachedMenuWithTab && movedBackByShiftTab && focus.active && focus.matchesFocusVisible &&
      focus.outlineWidth >= 3 && focus.outlineStyle !== 'none',
    'Tab/Shift+Tab thực sự tới command menu và có outline focus-visible tối thiểu 3px');
    ktra(!!zoomTargets && zoomTargets.every(function (target) {
      return target.visual.scale >= 1.99 && target.visual.width < target.layoutViewport.width &&
        target.visual.height < target.layoutViewport.height && target.rendered && target.inside && target.interactable;
    }), 'CDP zoom 200% đưa command, điều hướng và action vào visual viewport thực không cắt/ẩn: ' +
      (zoomTargets ? JSON.stringify(zoomTargets.map(function (target) {
        return { visual: target.visual, layoutRect: target.layoutRect,
          visualBoundsInLayout: target.visualBoundsInLayout };
      })) : 'không có visualViewport'));
    kq.pairs.forEach(function (pair, index) {
      var a = lum(pair[0]), b = lum(pair[1]);
      var ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      ktra(ratio >= 4.5, 'token contrast cặp ' + (index + 1) + ' đạt AA (' + ratio.toFixed(2) + ':1)');
    });
  }
  ~~~

  Sau đăng nhập mobile, đưa p1 về Tổng quan để action cần kiểm chứng luôn tồn tại, rồi gọi đúng block sau. Hàm zoom bắt đầu ở mobile cho reduced-motion/focus, sau đó đổi sang tablet 1024px trước CDP để drawer 360px và action đều có thể nằm trọn trong visual viewport 512px ở 200%.

  ~~~js
  await vaoMan(p1, 'tongquan');
  await p1.waitForSelector('#noidung [data-act="doithue"]', { state: 'visible', timeout: 5000 });
  for (var khung of [[1440, 900], [1024, 768], [768, 1024], [390, 844]]) {
    await ktraKhungManHinh(p1, khung[0], khung[1], khung[0] + 'x' + khung[1]);
  }
  await ktraMotionZoomContrast(p1);
  await p1.setViewportSize({ width: 1400, height: 950 });
  ~~~

  Zoom dùng CDP cùng visualViewport thực: DOMRect được so sánh với biên visual viewport `offsetLeft/offsetTop + width/height` trong cùng hệ CSS/layout, còn `click({ trial: true })` chứng minh control không bị lớp khác che và có thể thao tác. Không dùng body.style.zoom hoặc che lỗi bằng overflow-x.

- [ ] **Step 2: Chạy test để xác nhận đỏ**

  Run: node tools/test-mp-ui.mjs

  Expected: FAIL “có token bề mặt và tín hiệu” vì --bg-space và --signal-cyan chưa tồn tại; mobile nut-menu hiện nhỏ hơn 44px; bốn cặp token contrast/reduced motion cũng chưa có contract mới.

- [ ] **Step 3: Thay CSS cũ bằng token nghĩa và component layout**

  Khai báo token mới, rồi giữ token cũ làm alias để mọi inline var(--cam), var(--lam), var(--do) trong renderer tiếp tục đúng.

  ~~~css
  :root {
    --bg-space: #05070f;
    --bg-command: #0a1020;
    --surface-1: #101827;
    --surface-2: #0a1120;
    --surface-raised: #17233a;
    --border-subtle: #263652;
    --border-strong: #456188;
    --text-primary: #e9f1ff;
    --text-secondary: #c4d0e5;
    --text-muted: #8a9ab5;
    --text-inverse: #07101d;
    --font-data: "Consolas", "DejaVu Sans Mono", monospace;
    --signal-cyan: #58d5ff;
    --signal-amber: #ffab45;
    --state-success: #63df9a;
    --state-warning: #ffd365;
    --state-danger: #ff717d;
    --state-info: #a990ff;
    --den: var(--bg-space);
    --panel: var(--surface-1);
    --panel2: var(--surface-2);
    --vien: var(--border-subtle);
    --vien2: var(--border-strong);
    --chu: var(--text-secondary);
    --mo: var(--text-muted);
    --sang: var(--text-primary);
    --cam: var(--signal-amber);
    --lam: var(--signal-cyan);
    --luc: var(--state-success);
    --do: var(--state-danger);
  }
  .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px;
    overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  html, body { max-inline-size:100%; }
  body { margin:0; background:var(--bg-space); color:var(--text-secondary); }
  button, input, select, textarea { min-inline-size:44px; min-block-size:44px; }
  #nut-tongquan, #nut-menu, #menu a, #menu button, .panel [data-act], button, .nut {
    display:inline-flex; align-items:center; justify-content:center;
    min-inline-size:44px; min-block-size:44px;
  }
  #thanh-tren, .tt-phu, #noidung, .panel { min-inline-size:0; }
  #thanh-tren {
    display:grid; grid-template-columns:auto minmax(0, 1fr) auto; gap:12px;
    align-items:center; min-block-size:64px; padding:8px 16px;
    background:var(--bg-command); border-block-end:1px solid var(--border-subtle);
  }
  #tt-res { display:grid; grid-template-columns:repeat(8, minmax(92px, 1fr)); gap:6px; min-inline-size:0; }
  #tt-res .o, .panel { background:var(--surface-1); border:1px solid var(--border-subtle); }
  .panel { padding:16px; border-radius:8px; min-inline-size:0; }
  #menu a, #menu button {
    box-sizing:border-box; inline-size:100%; justify-content:flex-start; padding:8px 12px;
    border:0; border-inline-start:3px solid transparent; background:transparent;
    color:var(--text-secondary); text-align:start; text-decoration:none; cursor:pointer;
  }
  #menu a.on, #menu button.on, #menu [aria-current="page"] {
    border-inline-start-color:var(--signal-cyan); background:var(--surface-raised); color:var(--text-primary);
  }
  .bang-cuon { max-inline-size:100%; overflow:auto; overscroll-behavior-inline:contain; }
  .bang-cuon > table { inline-size:max-content; min-inline-size:100%; }
  .hop-thoai .ht-trong { inline-size:min(640px, 100%); max-block-size:calc(100dvh - 32px); overflow:auto; }
  :focus-visible { outline:3px solid var(--signal-cyan); outline-offset:3px; }
  body.menu-mo { overflow:hidden; }
  @media (min-width:1200px) {
    .khung { display:grid; grid-template-columns:248px minmax(0, 1fr); gap:16px; padding:16px; }
    #menu { position:sticky; inset-block-start:16px; align-self:start; display:block !important;
      min-inline-size:0; max-block-size:calc(100dvh - 32px); overflow:auto; background:var(--surface-2); }
    #nut-menu { display:none; }
    .luoi { grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .bang-cuon { max-inline-size:100%; }
  }
  @media (min-width:768px) and (max-width:1199px) {
    .khung { display:block; padding:16px; }
    #menu { position:fixed; inset:0 auto 0 0; z-index:90; display:block; visibility:hidden; pointer-events:none;
      inline-size:min(360px, 88vw);
      padding:16px; overflow:auto; background:var(--surface-2); box-shadow:12px 0 32px rgb(0 0 0 / .45);
      transform:translateX(-105%); transition:transform 160ms ease; }
    #menu.mo-ra { visibility:visible; pointer-events:auto; transform:translateX(0); }
    #noidung, .panel, .bang-cuon { min-inline-size:0; max-inline-size:100%; }
    #tt-res { grid-template-columns:repeat(4, minmax(112px, 1fr)); }
    .luoi, .luoi2 { grid-template-columns:repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width:767px) {
    #thanh-tren { grid-template-columns:minmax(0, 1fr) auto; padding:8px; }
    #thanh-tren .tt-logo { min-inline-size:0; }
    #tt-res { grid-column:1 / -1; display:flex; overflow-x:auto; scroll-snap-type:inline mandatory;
      padding-block-end:2px; }
    #tt-res .o { flex:0 0 132px; scroll-snap-align:start; }
    .khung { display:block; padding:8px; }
    #menu { position:fixed; inset:0 auto 0 0; z-index:90; display:block; visibility:hidden; pointer-events:none;
      inline-size:min(320px, 88vw);
      padding:12px; overflow:auto; background:var(--surface-2); box-shadow:12px 0 32px rgb(0 0 0 / .45);
      transform:translateX(-105%); transition:transform 160ms ease; }
    #menu.mo-ra { visibility:visible; pointer-events:auto; transform:translateX(0); }
    #noidung, .panel, .bang-cuon { min-inline-size:0; max-inline-size:100%; }
    .luoi, .luoi2 { grid-template-columns:minmax(0, 1fr); }
    .panel { padding:12px; }
    .panel .nut:not(.nho), .panel [data-act="xay"], .panel [data-act="nc"], .panel [data-act="dong"] {
      inline-size:100%; }
  }
  @media (prefers-reduced-motion:reduce) {
    *, *::before, *::after { animation-duration:0.01ms !important; animation-iteration-count:1 !important;
      scroll-behavior:auto !important; transition-duration:0.01ms !important; }
  }
  .sz { font-family:var(--font-data); font-variant-numeric:tabular-nums; }
  ~~~

  Áp dụng --signal-amber cho .nut.oke và --state-success/--state-warning/--state-danger cùng text, không chỉ bằng màu, cho .luc/.vang/.do và toast. Giữ mọi breakpoint và selector trong block trên; không để lại media query 860px cũ cạnh tranh với ba dải này. #menu a được giữ trong selector cho markup cũ trong lúc Task 3 chuyển từng item sang #menu button.

- [ ] **Step 4: Chạy test xanh ở bốn breakpoint**

  Run: node tools/test-mp-ui.mjs

  Expected: PASS token/touch/no-overflow ở 1440x900, 1024x768, 768x1024 và 390x844; test menu cũ vẫn pass khi class mo-ra được CSS hỗ trợ.

- [ ] **Step 5: Commit token và responsive layout**

  ~~~bash
  git add css/style.css tools/test-mp-ui.mjs
  git commit -m "feat(ui): add orbital command tokens and responsive layout"
  ~~~

### Task 3: Command bar, navigation groups và preservation qua U.ve

**Files:**
- Modify: js/ui.js:5-198, 1324-1376
- Modify: web/js/mp.js:126-144
- Modify: tools/test-mp-ui.mjs:7-12, 177-260, 621-760

**Interfaces:**
- Consumes: U.MAN, U.thanhRes, U.veMenu, U.veChonHT, U.ve, U.live; resource IDs G.RES_HANH_TINH, galana, tech.
- Produces: U.chupTrang() -> { man, activeId, fields, scroll }; U.phucHoiTrang(snapshot) -> void chỉ khôi phục khi snapshot.man === U.man; U.tieuDeMan() -> string; U.ve() giữ focus/input/scroll nếu phần tử cùng ID còn tồn tại trên cùng màn.
- Produces: U.MAN entries có nhom là Đế quốc, Hạm đội, Cộng đồng hoặc Hệ thống; U.veMenu sinh button type="button" data-act="man" data-man giữ nguyên và aria-current="page" ở màn hiện hành.

- [ ] **Step 1: Viết test đỏ cho sáu tài nguyên, grouping và state preservation**

  Đổi import top-level hiện có thành import { fileURLToPath, pathToFileURL } from 'node:url';, rồi sau khi p1 vào Tổng quan thêm test sau.

  ~~~js
  var resCommand = await p1.locator('#tt-res').evaluate(function (e) { return e.textContent; });
  ['Kim Loại', 'Thạch Anh', 'Nhiên Liệu', 'Thực Phẩm', 'Galana', 'Kỹ Thuật', 'Điện', 'Bảo trì sau']
    .forEach(function (ten) { ktra(resCommand.indexOf(ten) >= 0, 'command bar có ' + ten); });

  await p1.fill('#thue-pct', '19');
  await p1.focus('#thue-pct');
  await p1.evaluate(function () { U.ve(); });
  ktra(await p1.evaluate(function () {
    return document.activeElement.id === 'thue-pct' &&
      document.getElementById('thue-pct').value === '19';
  }), 'U.ve giữ focus và draft thuế');

  var nhomMenu = await p1.locator('#menu [data-menu-group]').evaluateAll(function (els) {
    return els.map(function (e) { return e.getAttribute('data-menu-group'); });
  });
  ['Đế quốc', 'Hạm đội', 'Cộng đồng', 'Hệ thống']
    .forEach(function (n) { ktra(nhomMenu.indexOf(n) >= 0, 'menu có nhóm ' + n); });

  var manDangChon = await p1.locator('#menu [aria-current="page"]').evaluateAll(function (els) {
    return els.map(function (e) { return e.getAttribute('data-man'); });
  });
  ktra(manDangChon.length === 1 && manDangChon[0] === 'tongquan',
    'menu công bố đúng một aria-current cho màn hiện hành');

  var giaTriVaCham = await p1.evaluate(function () {
    if (!U.ui || !U.chupTrang || !U.phucHoiTrang) return null;
    var main = document.getElementById('noidung');
    var manCu = U.man, daVeCu = U.ui.renderedMan;
    U.man = 'tongquan'; U.ui.renderedMan = 'tongquan';
    main.innerHTML = '<input id="draft-trung-id" value="draft-màn-cũ">';
    var snap = U.chupTrang();
    U.man = 'tainguyen';
    main.innerHTML = '<input id="draft-trung-id" value="mặc-định-màn-mới">';
    U.phucHoiTrang(snap);
    var value = document.getElementById('draft-trung-id').value;
    U.man = manCu; U.ui.renderedMan = daVeCu; U.ve();
    return value;
  });
  ktra(giaTriVaCham === 'mặc-định-màn-mới',
    'đổi màn không phục hồi draft vào ID trùng của màn đích');

  /* file:// phải tự lực: tạo bàn, giữ draft qua U.ve, lưu, tải lại và Tiếp tục. */
  var ctxFile = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'vi-VN' });
  var pFile = await ctxFile.newPage(), fileRequests = [];
  var fileRoot = pathToFileURL(path.join(GOC, 'index.html')).href;
  theoDoi('file solo', pFile);
  pFile.on('request', function (request) {
    if (/^https?:/.test(request.url())) fileRequests.push(request.url());
  });
  await pFile.goto(fileRoot, { waitUntil: 'domcontentloaded' });
  await pFile.waitForFunction('window.APP && APP.mp === false', null, { timeout: 20000 });
  ktra(await pFile.evaluate(function () { return location.protocol === 'file:' && APP.mp === false; }),
    'file:// root index.html mở đúng shell solo');
  await ktraShellSemantic(pFile, 'shell file:// root index.html', 'solo');
  await pFile.fill('#kd-ten', 'File Commander');
  await pFile.click('#kd-batdau');
  await pFile.waitForSelector('#game', { state: 'visible', timeout: 20000 });
  await pFile.fill('#thue-pct', '17');
  await pFile.focus('#thue-pct');
  await pFile.evaluate(function () { U.ve(); });
  ktra(await pFile.evaluate(function () {
    return document.activeElement.id === 'thue-pct' && document.getElementById('thue-pct').value === '17';
  }), 'file:// giữ focus và draft trước khi lưu');
  await pFile.click('[data-act="doithue"]');
  await pFile.waitForFunction('window.ST && ST.planets[0].danSu.taxBp === 1700', null, { timeout: 20000 });
  await pFile.click('[data-act="luu"]');
  await pFile.waitForFunction(function () {
    var raw = localStorage.getItem('thdc_save_v6');
    return !!raw && JSON.parse(raw).planets[0].danSu.taxBp === 1700;
  }, null, { timeout: 20000 });
  await pFile.reload({ waitUntil: 'domcontentloaded' });
  await pFile.waitForSelector('#kd-tieptuc', { state: 'visible', timeout: 20000 });
  await pFile.click('#kd-tieptuc');
  await pFile.waitForSelector('#game', { state: 'visible', timeout: 20000 });
  ktra(await pFile.evaluate(function () {
    return ST.ten === 'File Commander' && ST.planets[0].danSu.taxBp === 1700;
  }), 'file:// tải lại và Tiếp tục đúng state đã lưu');
  ktra(fileRequests.length === 0, 'file:// không phát sinh request HTTP dependency');
  await ctxFile.close();
  ~~~

- [ ] **Step 2: Chạy test để xác nhận đỏ**

  Run: node tools/test-mp-ui.mjs

  Expected: FAIL preservation vì U.ve thay #noidung bằng innerHTML, và FAIL menu group vì U.MAN/veMenu hiện chưa công bố nhóm.

- [ ] **Step 3: Cài state UI, resource readout và menu groups tối thiểu**

  Thêm state khép kín trong js/ui.js, không đưa nó vào ST, save hay request.

  ~~~js
  U.ui = { dialogOpener: null, drawerOpen: false, renderedMan: '' };
  U.chupTrang = function () {
    var out = { man: U.ui.renderedMan || U.man,
      activeId: (document.activeElement || {}).id || '', fields: {}, scroll: [] };
    var fields = document.querySelectorAll('#noidung input[id],#noidung textarea[id],#noidung select[id]');
    for (var i = 0; i < fields.length; i++) {
      out.fields[fields[i].id] = {
        value: fields[i].value,
        checked: !!fields[i].checked,
        selectedIndex: fields[i].selectedIndex
      };
    }
    var boxes = document.querySelectorAll('#noidung [data-ui-scroll]');
    for (var j = 0; j < boxes.length; j++) out.scroll.push({
      key: boxes[j].getAttribute('data-ui-scroll'),
      left: boxes[j].scrollLeft,
      top: boxes[j].scrollTop
    });
    return out;
  };
  U.phucHoiTrang = function (snap) {
    if (!snap || snap.man !== U.man) return;
    var main = document.getElementById('noidung'), id, e, f;
    if (!main) return;
    function trongNoiDung(id) {
      var nodes = main.querySelectorAll('[id]');
      for (var n = 0; n < nodes.length; n++) if (nodes[n].id === id) return nodes[n];
      return null;
    }
    function vungCuon(key) {
      var boxes = main.querySelectorAll('[data-ui-scroll]');
      for (var n = 0; n < boxes.length; n++) {
        if (boxes[n].getAttribute('data-ui-scroll') === key) return boxes[n];
      }
      return null;
    }
    for (id in snap.fields) {
      e = trongNoiDung(id); f = snap.fields[id];
      if (!e) continue;
      if (e.type === 'checkbox' || e.type === 'radio') e.checked = f.checked;
      else if (e.tagName === 'SELECT') e.selectedIndex = f.selectedIndex;
      else e.value = f.value;
    }
    for (var i = 0; i < snap.scroll.length; i++) {
      e = vungCuon(snap.scroll[i].key);
      if (e) { e.scrollLeft = snap.scroll[i].left; e.scrollTop = snap.scroll[i].top; }
    }
    e = snap.activeId && trongNoiDung(snap.activeId);
    if (e && !e.disabled) e.focus({ preventScroll: true });
  };
  U.tieuDeMan = function () {
    for (var i = 0; i < U.MAN.length; i++) if (U.MAN[i].id === U.man) return U.MAN[i].ten;
    return 'Tổng Quan';
  };
  ~~~

  Trong U.ve, gọi var snap = U.chupTrang() trước replacement; vẽ resource/menu/cảnh báo/select/main; prepend <h1 id="man-tieu-de" tabindex="-1"> bằng U.tieuDeMan(); gọi U.phucHoiTrang(snap) rồi gán U.ui.renderedMan = U.man. Nhờ renderedMan, snapshot DOM của màn cũ không bị nhầm với U.man mới đã được ACT.man đổi trước U.ve. Không gọi U.ve từ U.live khi chỉ số data-live đổi. Render resource thành readout có nhãn, giữ bốn resource hành tinh rồi Galana/Kỹ Thuật, tiếp theo Điện/Bảo trì. Đổi menu item từ a không href thành button mang data-act/data-man hiện có và headings data-menu-group; CSS Task 2 đã style cả #menu a lẫn #menu button. Cập nhật U.MAN trong web/js/mp.js:126-144 bằng cùng property nhom, thêm Bảng Tin/Chat vào Cộng đồng và Tài Khoản vào Hệ thống.

- [ ] **Step 4: Chạy test xanh và kiểm tra mọi màn vẫn điều hướng**

  Run: node tools/test-mp-ui.mjs

  Expected: PASS sáu resource, Điện/Bảo trì, bốn nhóm, focused draft. Vòng lặp test hiện hữu qua 16 mục multiplayer tiếp tục PASS vì data-man không đổi.

- [ ] **Step 5: Commit command bar và preservation**

  ~~~bash
  git add js/ui.js web/js/mp.js tools/test-mp-ui.mjs
  git commit -m "feat(ui): preserve renderer state in command navigation"
  ~~~

### Task 4: Drawer, modal, toast và keyboard focus contract

**Files:**
- Modify: js/ui.js:20-32
- Modify: js/app.js:35-40, 261-309
- Modify: js/main.js:183-185
- Modify: web/js/mp.js:628-630
- Modify: css/style.css:74-107, 175-189
- Modify: tools/test-mp-ui.mjs:621-644

**Interfaces:**
- Consumes: U.ui, U.chupTrang/U.phucHoiTrang, nut-menu, menu, hop-thoai, ht-td, ht-noi, toast, APP.ACT.
- Produces: U.datDrawer(open) -> void; U.chuyenDrawer() -> void; U.hop(title, html, options) -> void; U.dongHop() -> void; U.giuTabTrongHop(event) -> void.
- Produces: Drawer đồng bộ class mo-ra, body class menu-mo, aria-expanded và aria-hidden; dialog focus input đầu tiên hoặc options.initialFocus, Tab/Shift+Tab bị giữ trong dialog, Escape chỉ đóng dialog không phá huỷ và trả focus về opener; Escape không đóng dialog options.destructive.

- [ ] **Step 1: Viết test đỏ cho drawer/dialog/toast**

  Mở một dialog không phá huỷ qua đổi tên và kiểm tra keyboard contract.

  ~~~js
  await p3.setViewportSize({ width: 390, height: 844 });
  await p3.click('#nut-menu');
  ktra(await p3.locator('#nut-menu').evaluate(function (e) { return e.getAttribute('aria-expanded') === 'true'; }),
    'drawer mở công bố aria-expanded');
  ktra(await p3.locator('#noidung').evaluate(function (root) {
    return root.inert === true && document.getElementById('chan').inert === true &&
      document.getElementById('tt-res').inert === true;
  }), 'drawer mở đặt phần nền inert');
  await p3.locator('#nut-menu').focus();
  await p3.keyboard.press('Tab');
  ktra(await p3.locator('#menu').evaluate(function (drawer) {
    return drawer.contains(document.activeElement) &&
      !document.getElementById('noidung').contains(document.activeElement);
  }), 'Tab khi drawer mở chỉ tới điều hướng, không lọt vào nền inert');
  await p3.keyboard.press('Escape');
  ktra(await p3.locator('#nut-menu').evaluate(function (e) { return e.getAttribute('aria-expanded') === 'false'; }),
    'Escape đóng drawer');
  ktra(await p3.locator('#noidung').evaluate(function (root) { return root.inert === false; }),
    'đóng drawer trả nền về trạng thái focusable');

  await vaoMan(p1, 'tongquan');
  await p1.click('[data-act="doi-ten"]');
  ktra(await p1.evaluate(function () {
    var modal = document.getElementById('hop-thoai');
    return modal.style.display !== 'none' && document.activeElement.id === 'ten-ht';
  }), 'dialog đưa focus vào input đầu tiên');
  await p1.locator('#hop-thoai [data-act="dong-ht"]').focus();
  await p1.keyboard.press('Shift+Tab');
  ktra(await p1.locator('#hop-thoai [data-act="doi-ten-ok"]').evaluate(function (el) {
    return document.activeElement === el;
  }), 'Shift+Tab từ phần tử đầu quay về phần tử cuối dialog');
  await p1.keyboard.press('Tab');
  ktra(await p1.locator('#hop-thoai [data-act="dong-ht"]').evaluate(function (el) {
    return document.activeElement === el;
  }), 'Tab từ phần tử cuối quay về close dialog');
  await p1.keyboard.press('Escape');
  ktra(await p1.evaluate(function () {
    return document.activeElement.getAttribute('data-act') === 'doi-ten';
  }), 'dialog trả focus về opener');

  await p1.evaluate(function () {
    U.hop('Xác nhận phá huỷ', '<button type="button">Không được kích hoạt</button>',
      { destructive: true, initialFocus: '[data-act="dong-ht"]' });
  });
  await p1.keyboard.press('Escape');
  ktra(await p1.isVisible('#hop-thoai'), 'Escape không đóng dialog phá huỷ');
  await p1.click('#hop-thoai [data-act="dong-ht"]');
  ~~~

  Thêm kiểm tra một U.toast('x', 'loi') sinh phần tử role="alert" còn success/default là role="status".

- [ ] **Step 2: Chạy test để xác nhận đỏ**

  Run: node tools/test-mp-ui.mjs

  Expected: FAIL vì nut-menu chỉ toggle class, nền chưa inert, Escape chưa có listener và U.hop chưa trap/khôi phục focus.

- [ ] **Step 3: Cài stateful controls mà không thay contract APP.ACT**

  Cài methods trong U và nối listener keyboard duy nhất trong js/app.js.

  ~~~js
  U.ui.dialogDestructive = false;
  U.datDrawer = function (open) {
    var menu = document.getElementById('menu');
    var button = document.getElementById('nut-menu');
    U.ui.drawerOpen = !!open;
    menu.classList.toggle('mo-ra', U.ui.drawerOpen);
    var drawerViewport = window.matchMedia('(max-width: 1199px)').matches;
    menu.setAttribute('aria-hidden', drawerViewport && !U.ui.drawerOpen ? 'true' : 'false');
    var background = document.querySelectorAll(
      '#thanh-canh,#tt-res,#chon-ht,#nut-tongquan,#chan,#noidung,' +
      '#thanh-tren [data-act="luu"],#thanh-tren [data-act="dangxuat"]');
    for (var i = 0; i < background.length; i++) background[i].inert = drawerViewport && U.ui.drawerOpen;
    button.setAttribute('aria-expanded', U.ui.drawerOpen ? 'true' : 'false');
    document.body.classList.toggle('menu-mo', U.ui.drawerOpen);
  };
  U.chuyenDrawer = function () { U.datDrawer(!U.ui.drawerOpen); };
  U.hop = function (td, html, opt) {
    opt = opt || {};
    var modal = document.getElementById('hop-thoai');
    U.ui.dialogOpener = document.activeElement;
    U.ui.dialogDestructive = !!opt.destructive;
    document.getElementById('ht-td').textContent = td;
    document.getElementById('ht-noi').innerHTML = html;
    modal.style.display = 'flex';
    var first = opt.initialFocus ? modal.querySelector(opt.initialFocus) : null;
    if (!first) first = modal.querySelector(
      'input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled])');
    if (first) first.focus({ preventScroll: true });
  };
  U.dongHop = function () {
    document.getElementById('hop-thoai').style.display = 'none';
    var opener = U.ui.dialogOpener; U.ui.dialogOpener = null; U.ui.dialogDestructive = false;
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  };
  U.giuTabTrongHop = function (event) {
    if (event.key !== 'Tab') return;
    var nodes = document.querySelectorAll(
      '#hop-thoai button:not([disabled]),#hop-thoai input:not([disabled]),' +
      '#hop-thoai select:not([disabled]),#hop-thoai textarea:not([disabled]),#hop-thoai [tabindex]:not([tabindex="-1"])');
    var first = nodes[0], last = nodes[nodes.length - 1];
    if (!first) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  ~~~

  Thêm listener keyboard duy nhất dưới listener click của js/app.js và thay ACT.man/main.js/mp.js theo code dưới đây.

  ~~~js
  document.addEventListener('keydown', function (event) {
    var modal = document.getElementById('hop-thoai');
    if (event.key === 'Escape' && modal && modal.style.display !== 'none') {
      event.preventDefault();
      if (!U.ui.dialogDestructive) U.dongHop();
      return;
    }
    if (event.key === 'Escape' && U.ui.drawerOpen) {
      event.preventDefault(); U.datDrawer(false); document.getElementById('nut-menu').focus(); return;
    }
    if (modal && modal.style.display !== 'none') U.giuTabTrongHop(event);
  });
  ACT.man = function (el) {
    var next = el.getAttribute('data-man'), changed = U.man !== next, fromDrawer = U.ui.drawerOpen;
    U.man = next;
    U.datDrawer(false); U.ve(); window.scrollTo(0, 0);
    if (changed || fromDrawer) {
      var title = document.getElementById('man-tieu-de');
      if (title) title.focus({ preventScroll: true });
    }
  };
  document.getElementById('nut-menu').onclick = function () { U.chuyenDrawer(); };
  ~~~

  Trong U.toast, đặt d.setAttribute('role', loai === 'loi' ? 'alert' : 'status') trước append; text không đổi. Chỉ thêm options cho dialog phá huỷ: js/app.js:226 Bỏ hoang dùng { destructive: true, initialFocus: '#bh-xn' }; js/main.js:134 Xoá bàn dùng { destructive: true, initialFocus: '[data-act="dong-ht"]' }; web/js/mp.js:426 Loại thành viên dùng { destructive: true, initialFocus: '[data-act="dong-ht"]' }; web/js/mp.js:522 Xoá tài khoản dùng { destructive: true, initialFocus: '#xtk-mk' }. Nút close data-act="dong-ht" luôn đóng rõ ràng và U.dongHop trả focus về opener; Escape dialog phá huỷ chỉ bị chặn, không gửi action. CSS drawer phủ vùng đọc tablet/mobile, khoá scroll nền qua menu-mo, và modal bảo đảm vùng nội dung tự cuộn/có close target 44px.

- [ ] **Step 4: Chạy test xanh**

  Run: node tools/test-mp-ui.mjs

  Expected: PASS drawer Escape/inert, Tab/Shift+Tab trap, dialog focus restore và toast live role; các action do data-act tiếp tục đi qua delegation js/app.js:261-266.

- [ ] **Step 5: Commit interaction accessibility**

  ~~~bash
  git add js/ui.js js/app.js js/main.js web/js/mp.js css/style.css tools/test-mp-ui.mjs
  git commit -m "feat(ui): add accessible drawer and dialog behavior"
  ~~~

### Task 5: Semantic renderer cho Economy và Construction

**Files:**
- Modify: js/ui.js:203-538
- Modify: css/style.css:108-145
- Modify: tools/test-mp-ui.mjs:177-260

**Interfaces:**
- Consumes: U.ve, renderer functions U.m_tongquan, U.m_tainguyen, U.m_congtrinh, U.m_nghiencuu, U.m_xuong, U.m_phongthu, mọi ID input/action hiện có.
- Produces: U.nhanTruong(id, label, controlHtml, helpHtml) -> string; U.bang(id, caption, headHtml, bodyHtml, className) -> string; U.chuanHoaNoiDung(root) -> void.
- Produces: Mỗi renderer màn có h1 màn, panel heading liên kết, field label/description, bảng caption/th scope/scroll region và data-ui-scroll ổn định.

- [ ] **Step 1: Viết test đỏ cho form/table contract ở ba màn đầu**

  Thêm native audit không dùng axe.

  ~~~js
  async function loiNoiDungNative(page) {
    return await page.evaluate(function () {
      var root = document.getElementById('noidung');
      var errors = [];
      root.querySelectorAll('input[id],select[id],textarea[id]').forEach(function (e) {
        if (e.type === 'hidden' || e.type === 'file') return;
        if (!document.querySelector('label[for="' + e.id + '"]') && !e.getAttribute('aria-label')) errors.push('field:' + e.id);
      });
      root.querySelectorAll('table').forEach(function (t) {
        if (!t.querySelector('caption') && !t.getAttribute('aria-label')) errors.push('table');
        t.querySelectorAll('th').forEach(function (th) {
          if (!th.getAttribute('scope')) errors.push('th');
        });
      });
      if (!root.querySelector('h1')) errors.push('h1');
      return errors;
    });
  }
  ~~~

  Với mỗi man trong tongquan, tainguyen, congtrinh, chạy đoạn thực thi dưới đây.

  ~~~js
  for (var manKinhTe of ['tongquan', 'tainguyen', 'congtrinh']) {
    await vaoMan(p1, manKinhTe);
    var loiKinhTe = await loiNoiDungNative(p1);
    ktra(loiKinhTe.length === 0,
      manKinhTe + ': không còn lỗi form/table native: ' + loiKinhTe.join(','));
  }
  ~~~

- [ ] **Step 2: Chạy test để xác nhận đỏ**

  Run: node tools/test-mp-ui.mjs

  Expected: FAIL các field thue-pct, cho-metal và ct-sl-metalMine thiếu label; các table thiếu caption/scope và màn chưa có h1.

- [ ] **Step 3: Cài helper renderer và áp dụng cho Tổng quan, Tài nguyên, Công trình**

  Đầu js/ui.js, thêm helper string thuần; không đổi U.form, U.cho hoặc tên/action của control.

  ~~~js
  U.nhanTruong = function (id, nhan, control, troGiup) {
    var help = troGiup ? '<span id="' + id + '-help" class="truong-trogiup">' + troGiup + '</span>' : '';
    return '<div class="truong"><label for="' + id + '">' + nhan + '</label>' +
      control.replace(' id="' + id + '"', ' id="' + id + '"' + (troGiup ? ' aria-describedby="' + id + '-help"' : '')) +
      help + '</div>';
  };
  U.bang = function (id, caption, head, rows, cls) {
    return '<div class="bang-cuon ' + (cls || '') + '" data-ui-scroll="' + id +
      '" tabindex="0" role="region" aria-label="' + caption + '"><table><caption class="sr-only">' +
      caption + '</caption><thead>' + head + '</thead><tbody>' + rows + '</tbody></table></div>';
  };
  U.chuanHoaNoiDung = function (root) {
    var tables = root.querySelectorAll('table');
    for (var i = 0; i < tables.length; i++) {
      var heads = tables[i].querySelectorAll('thead th');
      for (var j = 0; j < heads.length; j++) heads[j].setAttribute('scope', 'col');
      var rowHeads = tables[i].querySelectorAll('tbody th');
      for (var k = 0; k < rowHeads.length; k++) rowHeads[k].setAttribute('scope', 'row');
    }
  };
  ~~~

  Gọi U.chuanHoaNoiDung(document.getElementById('noidung')) ngay sau khi U.ve đặt innerHTML. Áp dụng U.nhanTruong và U.bang cho:

  - U.m_tongquan: thue-pct có label “Thuế”, description đơn vị %, và bảng hành tinh/hàng đợi có caption.
  - U.m_tainguyen: bốn cho-metal/cho-crystal/cho-deut/cho-food có label tài nguyên, tỷ giá trợ giúp, và bảng sản lượng/loại hành tinh/chợ có caption.
  - U.m_congtrinh: mỗi ct-sl-* có label tên công trình + “số lô”; cost/time giữ ID ct-gia-* và ct-tg-*; bảng queue có caption.

  Mỗi table định nghĩa th scope="col" ở tiêu đề cột và th scope="row" cho label hàng. Những bảng quá rộng dùng U.bang hoặc có bang-cuon data-ui-scroll riêng. CSS .truong, .truong-trogiup, caption.sr-only, .bang-cuon[role=region]:focus-visible và panel heading phải dùng token Task 2.

- [ ] **Step 4: Mở rộng cùng contract cho Nghiên cứu, Xưởng và Phòng thủ**

  Áp dụng U.nhanTruong/U.bang vào U.m_nghiencuu, U.m_xuong và U.m_phongthu:

  ~~~js
  for (var i = 0; i < G.SHIPS.length; i++) {
    var item = G.SHIPS[i];
    h += U.nhanTruong('sl-' + item.id, 'Số lượng ' + U.esc(item.ten),
      '<input id="sl-' + item.id + '" type="number" min="1" value="1">', 'Nhập số lô cần đóng.');
  }
  ~~~

  Giữ các ID sl-*, ct-sl-*, tl-g/tl-h/tl-p/tl-n và các data-act xay/nc/dong/ban-ten-lua. Với bảng công nghệ, queue đóng tàu, phòng thủ và missile, thêm caption/scope/data-ui-scroll; readonly tl-g vẫn có label “Thiên hà mục tiêu”.

- [ ] **Step 5: Chạy test xanh và commit**

  Run: node tools/test-mp-ui.mjs

  Expected: PASS native audit ở sáu màn Economy/Construction; test xây mỏ, thay thuế, bán chợ và launch missile hiện hữu vẫn PASS.

  ~~~bash
  git add js/ui.js css/style.css tools/test-mp-ui.mjs
  git commit -m "feat(ui): make economy and construction screens accessible"
  ~~~

### Task 6: Semantic renderer cho Fleet, Galaxy, Alliance và Ranking

**Files:**
- Modify: js/ui.js:598-998
- Modify: css/style.css:137-145, 191-196
- Modify: tools/test-mp-ui.mjs:202-413

**Interfaces:**
- Consumes: U.nhanTruong, U.bang, U.chuanHoaNoiDung, U.capNhatForm, U.form, data-act nv/gui/gal/gal-di/lm-*/xh-loai và selector test hiện hữu.
- Produces: Màn Hạm Đội có field label cho f-*, ft-*, fl-*, fc-*; Màn Thiên Hà, Liên Minh, Xếp Hạng dùng named scroll regions/table captions; every action retains data-act/payload.

- [ ] **Step 1: Viết test đỏ cho fleet/galaxy scroll + accessible fields**

  ~~~js
  await vaoMan(p1, 'hamdoi');
  ktra((await loiNoiDungNative(p1)).length === 0, 'Hạm Đội có form/table native contract');
  await p1.setViewportSize({ width: 390, height: 844 });
  await vaoMan(p1, 'thienha', '/api/he');
  var galaxyScroll = await p1.locator('[data-ui-scroll="galaxy-table"]').evaluate(function (e) {
    var max = Math.max(0, e.scrollWidth - e.clientWidth);
    var target = max ? Math.max(1, Math.floor(max / 2)) : 0;
    e.scrollLeft = target;
    return { max: max, target: target, value: e.scrollLeft };
  }).catch(function () { return null; });
  ktra(!!galaxyScroll && galaxyScroll.max > 0 && galaxyScroll.value === galaxyScroll.target,
    'bảng thiên hà mobile có vùng cuộn ngang thực sự');
  var galaxyAfter = null;
  if (galaxyScroll) {
    await p1.evaluate(function () { U.ve(); });
    galaxyAfter = await p1.locator('[data-ui-scroll="galaxy-table"]').evaluate(function (e) { return e.scrollLeft; });
  }
  ktra(!!galaxyScroll && galaxyAfter === galaxyScroll.value,
    'U.ve giữ giá trị scroll đã clamp của bảng thiên hà');
  await p1.setViewportSize({ width: 1400, height: 950 });
  ~~~

- [ ] **Step 2: Chạy test để xác nhận đỏ**

  Run: node tools/test-mp-ui.mjs

  Expected: FAIL vì chưa có galaxy-table data-ui-scroll và các f-*/g-g/g-h chưa có label.

- [ ] **Step 3: Áp dụng contract cho Hạm Đội và Thiên Hà**

  Thay các chuỗi input trong U.m_hamdoi/U.m_thienha bằng U.nhanTruong. Bắt buộc label:

  - f-g, f-h, f-p: Thiên hà/Hệ/Hành tinh mục tiêu.
  - f-mission: Nhiệm vụ; f-pct: Tốc độ; f-giu: Giờ giữ chỗ.
  - từng ft-*, fl-*, fc-*: số tàu/lính/tài nguyên có tên từ G.SHIPS, G.BOBINH, G.RES_HANH_TINH.
  - g-g/g-h: Thiên hà/Hệ cần xem.

  Trước vòng for hiện có của U.m_thienha, khai báo var rows = ''; và đổi mọi phép nối chuỗi hàng bảng trong vòng đó từ h sang rows; không dùng biến rows chưa khai báo. Sau vòng for, bọc table bản đồ bằng lời gọi đầy đủ U.bang dưới đây và giữ tr.nguoi, tr.toi, data-act nv/tuyen-chien/gui-thu để test PvP không đổi.

  ~~~js
  var rows = '';
  h += U.bang('galaxy-table', 'Bản đồ thiên hà',
    '<tr><th scope="col">Ô</th><th scope="col">Hành tinh</th><th scope="col">Chỉ huy</th>' +
    '<th scope="col">Liên minh</th><th scope="col">Điểm</th><th scope="col">Phế liệu</th>' +
    '<th scope="col">Hành động</th></tr>', rows, 'bang-thien-ha');
  ~~~

  Đặt role="group" aria-label cho cụm điều khiển thiên hà và action hạm đội.

- [ ] **Step 4: Áp dụng contract cho Liên minh và Xếp hạng**

  Dùng U.bang với các key alliance-members, alliance-list và ranking-table. Đặt caption đúng nội dung dữ liệu, scope col/row, và không biến cả hàng thành button. Các action chuyen-galana, lm-vao, lm-ra, xh-loai giữ data-act; button filter xếp hạng thêm aria-pressed theo U.xhLoai.

- [ ] **Step 5: Chạy test xanh và commit**

  Run: node tools/test-mp-ui.mjs

  Expected: PASS native audit và preservation; baseline test tiếp tục thấy 16 hàng thiên hà, battle/spy/tuyên chiến buttons, liên minh và bảng xếp hạng.

  ~~~bash
  git add js/ui.js css/style.css tools/test-mp-ui.mjs
  git commit -m "feat(ui): improve fleet galaxy and community data views"
  ~~~

### Task 7: Semantic renderer cho Reports, System và Combat simulator

**Files:**
- Modify: js/ui.js:1003-1190, 1464-1556
- Modify: js/app.js:192-212
- Modify: css/style.css:147-173
- Modify: tools/test-mp-ui.mjs:202-240, 605-619

**Interfaces:**
- Consumes: U.bang, U.nhanTruong, U.veBaoCao, U.veDoTham, U.veBaoCaoTenLua, U.m_tinnhan, U.m_nhatky, U.m_huongdan, U.m_mophong and APP.ACT mp-*.
- Produces: Báo cáo/messaging, nhật ký/lưu/hướng dẫn và simulator có heading/landmark/table/form contract; action doc-tin/doc-het/xoa-tin/mp-* giữ ID, data-act và payload.

- [ ] **Step 1: Viết test đỏ qua các màn system**

  ~~~js
  for (var manSystem of ['tinnhan', 'nhatky', 'huongdan', 'mophong']) {
    await vaoMan(p1, manSystem);
    var nativeErrors = await loiNoiDungNative(p1);
    ktra(nativeErrors.length === 0, manSystem + ': không còn lỗi form/table native: ' + nativeErrors.join(','));
  }
  ~~~

  Giữ cú pháp JavaScript thực thi được trong môi trường Node module hiện tại; vòng lặp for-of trên array literal là hợp lệ với Node >=22.5.

- [ ] **Step 2: Chạy test để xác nhận đỏ**

  Run: node tools/test-mp-ui.mjs

  Expected: FAIL do table báo cáo/simulator thiếu caption/scope và mophong inputs mpa-*, mpd-*, mpf-*, mpta-*, mptd-* chưa có label.

- [ ] **Step 3: Chuẩn hoá báo cáo và Tin nhắn**

  Cập nhật U.veBaoCao/U.veDoTham/U.veBaoCaoTenLua và U.m_tinnhan:

  ~~~js
  var rounds = kq.vongDanh || [], rows = '';
  for (var i = 0; i < rounds.length; i++) {
    var v = rounds[i];
    rows += '<tr><td class="c">' + v.vong + '</td><td class="r sz">' + G.soNgan(v.lucA) +
      '</td><td class="r sz">' + G.soNgan(v.lucD) + '</td><td class="r sz">' + G.so(v.conA) +
      '</td><td class="r sz">' + G.so(v.conD) + '</td><td class="mo">' +
      (v.haDoCao ? 'lớp quỹ đạo đã bị dẹp — hạm đội hạ độ cao' :
        (v.matDat ? 'hạm đội đã xuống tầng khí quyển — phòng thủ mặt đất tham chiến' : 'giao chiến trên quỹ đạo')) +
      '</td></tr>';
  }
  h += U.bang('combat-rounds', 'Diễn biến từng vòng giao chiến',
    '<tr><th scope="col">Vòng</th><th scope="col">Lực tấn công</th>' +
    '<th scope="col">Lực phòng thủ</th><th scope="col">Đơn vị còn (A)</th>' +
    '<th scope="col">Đơn vị còn (D)</th><th scope="col">Ghi chú</th></tr>',
    rows, 'bang-bao-cao');
  ~~~

  Mỗi message disclosure hiện là div data-act doc-tin; đổi thành button type="button" cùng data-act/data-i, aria-expanded theo U.moTin[i] và aria-controls tới nội dung. Bảng báo cáo luôn có caption, headers scope và scroll region. Không thay nội dung báo cáo, class kq hoặc logic doc-tin/doc-het/xoa-tin.

- [ ] **Step 4: Chuẩn hoá Nhật ký, Hướng dẫn và Máy tính trận**

  Nhật ký/lưu/hướng dẫn nhận h1 từ U.ve và tables semantic qua U.bang. Trong mophong, dùng U.nhanTruong cho tất cả mpa-*, mpd-*, mpf-*, mpta-weapon/shield/armor và mptd-weapon/shield/armor; mỗi cluster có fieldset/legend “Bên tấn công” hoặc “Bên phòng thủ”. Giữ APP.ACT mp-chay/mp-nap-ham/mp-xoa/mp-nap-bc và U.mpDoc/U.mpChay không đổi.

- [ ] **Step 5: Chạy test xanh và commit**

  Run: node tools/test-mp-ui.mjs

  Expected: PASS native audit ở bốn màn; test UI vẫn vẽ nội dung cho mỗi data-man và không sinh pageerror.

  ~~~bash
  git add js/ui.js js/app.js css/style.css tools/test-mp-ui.mjs
  git commit -m "feat(ui): make reports and system screens accessible"
  ~~~

### Task 8: Multiplayer loading, error, network và chat live behavior

**Files:**
- Modify: web/js/mp.js:16-246, 491-506, 549-648
- Modify: js/ui.js:121-149
- Modify: css/style.css:156-173
- Modify: tools/test-mp-ui.mjs:57-133, 522-603

**Interfaces:**
- Consumes: API endpoints /api/state, /api/he, /api/xephang, /api/lm, /api/chat; MP.he/xh/lm/bt/chat; U.ve/U.toast; tt-net; chat-ds-chung/chat-ds-lienminh/chat-noi-*.
- Produces: MP.ui = { loading: Object, errors: Object, connection: string }; APP.thuLai(key) -> void; chat scroll/announcement state is UI-only and never sent to server.
- Produces: data-act="thu-lai" data-ui-retry key and data-act="chat-xuong" preserve APP delegation; no new server API, scheduler endpoint, payload or retry of game command.

- [ ] **Step 1: Viết test đỏ cho loading/network/chat preservation**

  Dùng Playwright route interception để chặn chỉ read API, không chặn /api/lam.

  ~~~js
  await p1.route('**/api/he?*', function (route) { return route.abort(); });
  await p1.evaluate(function () {
    MP.he = null;
    U.gal = { g: ST.planets[0].c.g, h: ST.planets[0].c.h };
    U.man = 'tongquan';
    U.ve();
  });
  await p1.click('#menu [data-man="thienha"]');
  var coRetryHe = await p1.waitForSelector('[data-ui-retry="he"]', {
    state: 'visible', timeout: 5000
  }).then(function () { return true; }, function () { return false; });
  ktra(coRetryHe, 'lỗi tải hệ có nút thử lại');
  var offlineHe = await p1.locator('#tt-net').evaluate(function (e) {
    return e.getAttribute('data-connection') === 'offline';
  }).catch(function () { return false; });
  ktra(offlineHe, 'network chip công bố offline');
  await p1.unroute('**/api/he?*');

  await vaoMan(p1, 'chat', '/api/chat');
  await p1.fill('#chat-noi-chung', 'draft không được mất');
  await p1.evaluate(function () { U.ve(); });
  ktra(await p1.inputValue('#chat-noi-chung') === 'draft không được mất',
    'render chat giữ draft đang gõ');
  ~~~

- [ ] **Step 2: Chạy test để xác nhận đỏ**

  Run: node tools/test-mp-ui.mjs

  Expected: FAIL vì MP chưa tạo data-ui-retry/data-connection, đồng thời renderer chưa có explicit state loading/error.

- [ ] **Step 3: Cài state trình bày MP và retry read-only**

  Khởi tạo MP.ui cạnh MP hiện có; mọi api call read đánh dấu loading/error theo key, còn APP.lam chỉ phản hồi lỗi qua callback/toast như contract cũ.

  ~~~js
  MP.ui = { loading: {}, errors: {}, connection: 'online' };
  function datTai(key, on) { MP.ui.loading[key] = !!on; if (on) delete MP.ui.errors[key]; }
  function datLoi(key, message) { MP.ui.loading[key] = false; MP.ui.errors[key] = message; }
  APP.thuLai = function (key) {
    if (key === 'he' && U.gal) return APP.taiHe(U.gal.g, U.gal.h);
    if (key === 'xephang') return APP.taiXepHang(U.xhLoai);
    if (key === 'lienminh') return taiLienMinh(true);
    if (key === 'chat') return taiChat(true);
  };
  ~~~

  Đổi netOK để set data-connection="online|offline" và aria-label trên tt-net thay vì chỉ inline color/title. U.nguon.xemHe/xepHang/dsLM và renderer MP U.m_bangtin/U.m_chat/U.m_taikhoan thể hiện skeleton/dòng “Đang tải …”, cached data “Đang làm mới”, hoặc error với button data-act="thu-lai" data-ui-retry đúng key. Trong U.m_bangtin và U.m_taikhoan, đổi mọi table sang U.bang với caption/scope/data-ui-scroll; không bỏ cache xác nhận gần nhất và không tự retry lệnh gameplay.

- [ ] **Step 4: Cài chat log semantic và scroll behavior**

  Trong U.m_chat trong mp.js, output container là role="log" aria-live="polite" aria-relevant="additions text", data-ui-scroll="chat-chung" hoặc data-ui-scroll="chat-lienminh"; mỗi chat-dong là role="listitem", input có label for, button có nhãn kênh. Trong capNhatChat, nếu activeElement là chat-noi-* hoặc user không ở đáy, đặt aria-live="off", giữ scrollTop, hiện button data-act="chat-xuong"; nếu user ở đáy, append/update và cuộn đáy. Sinh đúng markup action:

  ~~~js
  h += '<button class="nut nho chat-moi" type="button" data-act="chat-xuong" ' +
    'data-chat-target="chat-ds-chung">Xem tin mới</button>';
  h += '<button class="nut nho" type="button" data-act="thu-lai" ' +
    'data-ui-retry="chat">Thử lại</button>';
  ~~~

  Thêm APP.themACT handler:

  ~~~js
  'chat-xuong': function (el) {
    var box = document.getElementById(el.getAttribute('data-chat-target'));
    if (box) box.scrollTop = box.scrollHeight;
  },
  'thu-lai': function (el) {
    if (APP.thuLai) APP.thuLai(el.getAttribute('data-ui-retry'));
  }
  ~~~

  Mọi path thành công/thất bại chat-gui phải bật lại button, thêm text trạng thái qua U.toast và giữ draft nếu gửi thất bại.

- [ ] **Step 5: Chạy test xanh và commit**

  Run: node tools/test-mp-ui.mjs

  Expected: PASS error/retry/network state, chat draft, test chat/channels/membership hiện hữu và assertion không rò dữ liệu giữa account.

  ~~~bash
  git add web/js/mp.js js/ui.js css/style.css tools/test-mp-ui.mjs
  git commit -m "feat(ui): add multiplayer status and accessible chat"
  ~~~

### Task 9: Ghép acceptance UI cuối cùng

**Files:**
- Modify: tools/test-mp-ui.mjs:675-704, ngay sau pSolo bấm #kd-tieptuc và trước flow xoá save

**Interfaces:**
- Consumes: assertNativeA11y(page) của Task 1, helper native form/table của Task 5, assertion focus/drawer/dialog của Task 4, motion/zoom/contrast của Task 2, và contexts p1/pSolo đã có.
- Produces: Chỉ assertion Playwright tổng hợp; không thêm interface runtime.

- [ ] **Step 1: Ghép assertion native và flow keyboard-only cuối trên cả hai entrypoint đã chạy**

  Các red/green assertion thuộc owner đã được đặt ở Task 1 (/ và /index.html, /solo, /motnguoi, shell), Task 2 (breakpoint/zoom/motion/contrast), Task 3 (file:// và preservation), Task 4 (keyboard/dialog), Task 5-7 (form/table). Task này chỉ ghép regression cuối, nên không gọi nó là test đỏ và không đòi hỏi sửa runtime mới.

  ~~~js
  async function vaoManBangBanPhim(page, man) {
    var item = page.locator('#menu [data-man="' + man + '"]');
    await item.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(function (manDich) { return window.U && U.man === manDich; }, man,
      { timeout: 5000 });
  }
  async function chupGameplay(page) {
    return await page.evaluate(function () {
      var st = U.st(), p = st.planets[U.pi] || {};
      return JSON.stringify({
        pi: U.pi,
        taxBp: p.danSu && p.danSu.taxBp,
        res: p.res || null,
        galana: st.galana,
        tech: st.tech,
        fleets: (st.fleets || []).map(function (f) { return [f.id, f.den, f.nv, f.so]; })
      });
    });
  }

  /* locator.focus chỉ đặt điểm bắt đầu; mọi thao tác người dùng bên dưới là phím, không click/fill. */
  var ctxKeyboardAuth = await browser.newContext({ viewport: { width: 1024, height: 768 }, locale: 'vi-VN' });
  var pKeyboardAuth = await ctxKeyboardAuth.newPage();
  theoDoi('keyboard auth', pKeyboardAuth);
  await pKeyboardAuth.goto(URL + '/', { waitUntil: 'domcontentloaded' });
  await pKeyboardAuth.locator('#tab-dk').focus();
  await pKeyboardAuth.keyboard.press('Enter');
  await pKeyboardAuth.locator('#dk-ten').focus();
  await pKeyboardAuth.keyboard.type('Keyboard Draft');
  ktra(await pKeyboardAuth.locator('#dk-ten').evaluate(function (el) {
    return document.activeElement === el && el.value === 'Keyboard Draft';
  }), 'keyboard-only auth mở tab đăng ký và nhập draft không submit');
  await ctxKeyboardAuth.close();

  var stateMpTruoc = await chupGameplay(p1), stateSoloTruoc = await chupGameplay(pSolo);
  await vaoManBangBanPhim(p1, 'tongquan');
  await p1.locator('#chon-ht').focus();
  await p1.keyboard.press('Home');
  ktra(await p1.locator('#chon-ht').evaluate(function (el) {
    return document.activeElement === el && el.selectedIndex >= 0;
  }), 'keyboard-only điều hướng hành tinh giữ selector hoạt động');

  await vaoManBangBanPhim(p1, 'congtrinh');
  await p1.locator('#ct-sl-metalMine').focus();
  await p1.keyboard.press('Control+A');
  await p1.keyboard.type('2');
  ktra(await p1.locator('#ct-sl-metalMine').evaluate(function (el) { return el.value === '2'; }),
    'keyboard-only build sửa draft, không kích hoạt Xây');

  await vaoManBangBanPhim(p1, 'tainguyen');
  await p1.locator('#cho-metal').focus();
  await p1.keyboard.type('9');
  ktra(await p1.locator('#cho-metal').evaluate(function (el) { return el.value.indexOf('9') >= 0; }),
    'keyboard-only trade sửa draft, không kích hoạt giao dịch');

  await vaoManBangBanPhim(p1, 'hamdoi');
  await p1.locator('#f-g').focus();
  await p1.keyboard.press('Control+A');
  await p1.keyboard.type('1');
  ktra(await p1.locator('#f-g').evaluate(function (el) { return el.value === '1'; }),
    'keyboard-only fleet sửa toạ độ draft, không phát lệnh');

  await vaoManBangBanPhim(p1, 'chat');
  await p1.locator('#chat-noi-chung').focus();
  await p1.keyboard.type('draft keyboard chat');
  ktra(await p1.locator('#chat-noi-chung').evaluate(function (el) {
    return document.activeElement === el && el.value === 'draft keyboard chat';
  }), 'keyboard-only chat giữ draft, không gửi tin');

  await vaoManBangBanPhim(p1, 'lienminh');
  var controlLienMinh = p1.locator('#noidung button, #noidung input, #noidung select, #noidung textarea').first();
  await controlLienMinh.focus();
  await p1.keyboard.press('Escape');
  ktra(await controlLienMinh.evaluate(function (el) {
    return document.activeElement === el;
  }), 'keyboard-only alliance đi vào control màn, không kích hoạt action');

  await vaoManBangBanPhim(pSolo, 'nhatky');
  var saveSolo = pSolo.locator('[data-act="luu"]').first();
  await saveSolo.focus();
  await pSolo.keyboard.press('Enter');
  await pSolo.locator('[data-act="nhap"]').focus();
  await pSolo.keyboard.press('Enter');
  await pSolo.locator('#hop-thoai').waitFor({ state: 'visible', timeout: 5000 });
  await pSolo.keyboard.press('Escape');
  ktra(await pSolo.locator('#hop-thoai').evaluate(function (modal) {
    return modal.style.display === 'none';
  }), 'keyboard-only save/load lưu và mở/đóng Nạp mà không áp state');

  ktra(await chupGameplay(p1) === stateMpTruoc,
    'flow keyboard multiplayer không thay đổi gameplay');
  ktra(await chupGameplay(pSolo) === stateSoloTruoc,
    'flow keyboard solo không thay đổi gameplay');

  var nativeMp = await assertNativeA11y(p1);
  var nativeSolo = await assertNativeA11y(pSolo);
  ktra(nativeMp.length === 0, 'multiplayer không còn button/dialog native a11y lỗi: ' + nativeMp.join(','));
  ktra(nativeSolo.length === 0, 'solo không còn button/dialog native a11y lỗi: ' + nativeSolo.join(','));
  ktra(await pSolo.evaluate(function () {
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
      Array.from(document.querySelectorAll('[data-ui-scroll]')).every(function (box) {
        return box.clientWidth <= box.scrollWidth;
      });
  }), 'solo final không tràn ngang; mọi vùng data-ui-scroll có kích thước hợp lệ');
  ~~~

- [ ] **Step 2: Chạy regression aggregation**

  Run: node tools/test-mp-ui.mjs

  Expected: PASS. Đây là integration gate cho các assertion đã có red/green ở task sở hữu, không phải một vòng “test đỏ có thể PASS”.

- [ ] **Step 3: Chạy lệnh UI chuẩn của quality interface**

  Run: npm run test:ui

  Expected: PASS UI Chromium gồm gameplay cũ, shell, mọi màn form/table, focus/draft/scroll, modal/drawer/toast, MP loading/chat, /, /index.html, /solo, /motnguoi, file://, bốn breakpoint, zoom, reduced motion và contrast token.

  Run: ! rg -n '\$\$?eval' tools/test-mp-ui.mjs

  Expected: không có shorthand element-eval; mọi đọc/ghi trên một tập phần tử dùng locator().evaluate hoặc locator().evaluateAll.

- [ ] **Step 4: Commit regression aggregation**

  ~~~bash
  git add tools/test-mp-ui.mjs
  git diff --cached --check
  git commit -m "test(ui): aggregate orbital command acceptance coverage"
  ~~~

### Task 10: Sinh artifact và verification integration gate

**Files:**
- Modify: dist/thien-ha-dai-chien.html, generated by tools/build.js
- Modify: dist/artifact.html, generated by tools/build.js --artifact
- Verify only: tools/build.js:1-39, tools/source-manifest.js and tools/check-artifact.js supplied by quality workstream

**Interfaces:**
- Consumes: index.html relative solo shell, css/style.css and all ten facade scripts; quality manifest checker validates their canonical order.
- Produces: Hai artifact cập nhật, inline CSS/scripts, không reference PNG, không relative runtime dependency và không đổi source manifest/order.

- [ ] **Step 1: Xác nhận dependency checker đã được TDD ở Quality Task 3**

  Không thêm assertion artifact vào UI suite và không có bước đỏ ở Task 10: red/green cho manifest, deterministic build và checker artifact là trách nhiệm riêng của **Quality foundation Task 3**. UI Task 10 chỉ chạy sau khi checker đó đã xanh, sau UI Task 9 và trước Quality Task 12.

- [ ] **Step 2: Sinh artifact bằng build hiện hữu rồi verify output sinh ra**

  ~~~bash
  npm run build
  npm run check:artifact
  rg -n 'aria-label="Điều hướng nhiệm vụ"' dist/thien-ha-dai-chien.html dist/artifact.html
  ! rg -n 'thdc-orbital-command-reference\.png' dist/thien-ha-dai-chien.html dist/artifact.html
  ! rg -n 'src="js/|href="css/style\.css"' dist/thien-ha-dai-chien.html
  git diff -- dist/thien-ha-dai-chien.html dist/artifact.html
  ~~~

  Expected: npm run build sinh cả dist/thien-ha-dai-chien.html và dist/artifact.html; các assertion trên chạy **sau build** và xác nhận shell mới, không có PNG tham chiếu hoặc dependency solo tương đối; check artifact xác nhận manifest/order canonical; git diff chỉ hiển thị hai output generated cần stage.

- [ ] **Step 3: Chạy quality và UI gates trên artifact đã sinh**

  ~~~bash
  npm test
  npm run test:ui
  ~~~

  Expected: npm test và npm run test:ui PASS; không cần và không được tạo test đỏ artifact mới trong task này.

- [ ] **Step 4: Kiểm tra compatibility cuối**

  Run: rg -n 'thdc-orbital-command-reference\.png' index.html web/index.html css/style.css js/ui.js js/app.js js/main.js web/js/mp.js dist

  Expected: Không có reference PNG runtime. URL route vẫn được test bằng /, /index.html, /motnguoi, /solo và file:// root index.html; path static /web/js/mp.js vẫn là script multiplayer hợp lệ, không phải route entrypoint.

  Run: git diff --check

  Expected: không có whitespace error.

- [ ] **Step 5: Commit artifact và gate completion**

  ~~~bash
  git add dist/thien-ha-dai-chien.html dist/artifact.html
  git diff --cached --check
  git commit -m "build: refresh orbital command artifacts"
  git diff --exit-code -- dist/thien-ha-dai-chien.html dist/artifact.html
  ~~~

## Plan Self-Review

### Spec coverage

| Requirement | Implementing tasks |
| --- | --- |
| Semantic two-entry shell, login/forms, landmarks | 1 |
| Tokens, visual direction, desktop/tablet/mobile, touch/motion/overflow | 2 |
| Command bar, six resources, grouped navigation, render preservation | 3 |
| Drawer, dialog, toast, focus retention | 4 |
| Common render screens, tables, forms | 5, 6, 7 |
| Multiplayer network/loading/error/chat | 8 |
| /, /index.html, /solo, /motnguoi, file://, native a11y, zoom, contrast, keyboard | 1, 2, 3, 4, 9 |
| Build/artifact/source-order verification | 10 |
| Backward compatibility/no scheduler internals/no runtime bitmap | Global Constraints, 1, 3, 8, 9, 10 |

### Placeholder scan

The plan contains concrete paths, command lines, failing assertions, implementation signatures and commit commands for every task. It contains no deferred or unspecified implementation markers.

### Interface consistency

Task 3 defines U.chupTrang/U.phucHoiTrang and Task 4 only consumes them. Task 4 defines U.datDrawer/U.chuyenDrawer/U.hop/U.dongHop, which main.js and mp.js consume. Task 5 defines U.nhanTruong/U.bang, which Tasks 6 and 7 consume. Task 8 defines APP.thuLai and data-ui-retry/chat-xuong, which Task 9 tests. No task changes APP.lam payloads, U.form shape, MP API endpoints or script facade order.
