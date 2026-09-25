/**
 * Gera .smoke.html: uma cópia de index.html com o roteiro de teste anexado.
 * Fica na raiz do projeto para que os caminhos de css/ e js/ continuem válidos.
 */
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var out = html.replace('</body>', '<script src="test/smoke.js"></script>\n</body>');
fs.writeFileSync(path.join(root, '.smoke.html'), out);
console.log('.smoke.html gerado');
