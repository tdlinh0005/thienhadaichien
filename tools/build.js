/* Gộp toàn bộ game vào một file HTML duy nhất: node tools/build.js [file-ra] */
var fs = require('fs'), path = require('path');
var goc = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(goc, 'index.html'), 'utf8');
var css = fs.readFileSync(path.join(goc, 'css', 'style.css'), 'utf8');
var thuTu = ['data', 'util', 'galaxy', 'combat', 'engine', 'fleet', 'actions', 'ui', 'app', 'main'];
var artifactSom = process.argv.indexOf('--artifact') >= 0;
var js = thuTu.map(function (f) {
  return '/* ===== js/' + f + '.js ===== */\n' + fs.readFileSync(path.join(goc, 'js', f + '.js'), 'utf8');
}).join('\n');

/* Trong Artifact, trình xem không cấp quyền tải file: bỏ hẳn đoạn tạo blob + link tải */
if (artifactSom) {
  js = js.replace(/\/\*\[TAI-FILE-BAT-DAU\][\s\S]*?\[TAI-FILE-KET-THUC\]\*\//,
    "    'xuat-file': function () { U.toast('Môi trường này không tải file được — hãy dùng nút Sao chép.', 'loi'); },");
}

/* dùng hàm thay thế: nội dung có ký tự $ sẽ bị hiểu là mẫu $' , $& nếu truyền chuỗi */
html = html.replace('<link rel="stylesheet" href="css/style.css">', function () { return '<style>\n' + css + '\n</style>'; });
html = html.replace(/\n?\s*<script src="js\/[a-z]+\.js"><\/script>/g, '');
html = html.replace('</body>', function () { return '<script>\n' + js + '\n<' + '/script>\n</body>'; });
html = html.replace('<a href="docs/NGHIEN-CUU.md">phần nghiên cứu</a>',
  '<a href="https://github.com/tdlinh0005/thienhadaichien/blob/main/docs/NGHIEN-CUU.md" target="_blank" rel="noreferrer">phần nghiên cứu</a>');

/* Chế độ --artifact: bỏ khung <!doctype>/<html>/<head>/<body> để nhúng làm Artifact */
var artifact = process.argv.indexOf('--artifact') >= 0;
if (artifact) {
  var tieuDe = /<title>([^<]*)<\/title>/.exec(html)[1];
  var style = /<style>[\s\S]*?<\/style>/.exec(html)[0];
  var than = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
  html = '<title>' + tieuDe + '</title>\n' + style + '\n' +
    '<script>window.THDC_ARTIFACT=true;<' + '/script>\n' + than;
}

var ra = process.argv.filter(function (a) { return a.indexOf('--') !== 0; })[2] ||
  path.join(goc, 'dist', artifact ? 'artifact.html' : 'thien-ha-dai-chien.html');
fs.mkdirSync(path.dirname(ra), { recursive: true });
fs.writeFileSync(ra, html);
console.log('Đã ghi ' + ra + ' (' + Math.round(html.length / 1024) + ' KB)');
