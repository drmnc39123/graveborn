// ws YOL YÖNLENDİRİCİSİ — tek HTTP sunucusu, birden çok ws yolu.
//
// ⚠️ NİYE VAR: `new WebSocketServer({ server, path })` her örnek için ayrı
// bir `upgrade` dinleyicisi kuruyor ve YOLUNA UYMAYAN bağlantıyı reddediyor.
// İki ws sunucusu (presence + arena) aynı HTTP sunucusuna böyle bağlanınca
// ikisi de diğerinin bağlantısını HTTP 400 ile düşürüyor. Ölçüldü: arena
// soketi hiç açılmadı.
//
// Çözüm: her ws sunucusu `noServer: true` olacak ve upgrade isteğini YOLA
// GÖRE tek bir yerden dağıtacağız.

import type { Server } from 'node:http';
import type { WebSocketServer } from 'ws';

const yollar = new Map<string, WebSocketServer>();
const baglandi = new WeakSet<Server>();

export function routeUpgrade(server: Server, path: string, wss: WebSocketServer) {
  yollar.set(path, wss);
  if (baglandi.has(server)) return;
  baglandi.add(server);

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const wsserver = yollar.get(url.pathname);
    if (!wsserver) {
      // ⚠️ Bilinmeyen yol SESSİZCE ASILI BIRAKILMAZ: soket kapanmazsa
      // bağlantı sonsuza kadar açık kalır ve dosya tanıtıcısı sızar.
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }
    wsserver.handleUpgrade(req, socket, head, (ws) => wsserver.emit('connection', ws, req));
  });
}
