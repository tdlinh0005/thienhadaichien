/* Nạp bộ luật dùng chung (js/*.js) vào tiến trình server.
 * Client và server chạy CÙNG một bộ luật — không có hai bản sao logic. */
'use strict';
var fs = require('fs'), path = require('path');

var THU_TU = ['data', 'util', 'galaxy', 'combat', 'engine', 'fleet', 'actions'];

function nap() {
  if (!global.window) global.window = {};
  var goc = path.join(__dirname, '..', 'js');
  THU_TU.forEach(function (f) {
    var ma = fs.readFileSync(path.join(goc, f + '.js'), 'utf8');
    /* eval trong hàm riêng: các biến var của từng file không rò ra global,
       chỉ window.G được giữ lại (đúng như khi chạy trong trình duyệt). */
    (function () { eval(ma); })();
  });
  return global.window.G;
}

module.exports = { G: nap(), THU_TU: THU_TU };
