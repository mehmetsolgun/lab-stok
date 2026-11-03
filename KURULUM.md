# Lab Stok Takip — Google Drive bağlantısı kurulumu

Veriler sizin Google Drive'ınızdaki bir **Google E-Tablo**da durur. Üyeler Google hesabıyla giriş yapmaz;
uygulama, e-tablonun içindeki küçük bir **Apps Script** üzerinden konuşur. Hepsi ücretsizdir.
Kurulum bir kez yapılır (yaklaşık 10 dakika).

## 1. E-Tabloyu oluşturun
1. [drive.google.com](https://drive.google.com) → **Yeni → Google E-Tablolar** → adını `Lab Stok Veritabanı` yapın.
2. E-tabloyu **kimseyle paylaşmayın** (yalnızca siz görün). Üyelerin e-tabloya erişmesi gerekmez.

## 2. Arka uç kodunu ekleyin
1. E-tabloda **Uzantılar → Apps Script**.
2. Açılan editörde `Code.gs` içindeki her şeyi silin, bu klasördeki `apps-script/Code.gs` dosyasının tüm içeriğini yapıştırın, **Kaydet** (💾).
3. Üstteki fonksiyon listesinden **`setup`** seçin → **Çalıştır**.
   - İzin isteyecek: *İzinleri incele → hesabınızı seçin → Gelişmiş → "… (güvenli değil) sayfasına git" → İzin ver*. (Kod sizin kodunuz; yalnızca bu e-tabloya erişir.)
4. Alttaki **Yürütme günlüğü**nde `LAB ERİŞİM ANAHTARI: …` satırını bulup anahtarı kopyalayın. Anahtarı unutursanız `showKey` fonksiyonunu çalıştırın.

## 3. Web uygulaması olarak yayınlayın
1. Sağ üst **Dağıt → Yeni dağıtım** → ⚙ **Web uygulaması**.
2. **Şu kullanıcı olarak yürüt: Ben** · **Erişimi olanlar: Herkes** → **Dağıt**.
3. `…/exec` ile biten **Web uygulaması URL'sini** kopyalayın.

> "Herkes" seçeneği sitenin adresini bilenin istek atabilmesi demektir; veriye yalnızca **erişim anahtarını** bilenler ulaşır.
> Anahtarı yalnızca laboratuvar üyeleriyle paylaşın. Sızarsa `resetKey` fonksiyonunu çalıştırın (eski bağlantılar geçersiz olur).
> Koddaki bir değişikliği yayına almak için **Dağıt → Dağıtımları yönet → ✏ → Sürüm: Yeni sürüm**.

## 4. Uygulamayı bağlayın
1. Uygulamayı açın → **Bağlantı adresi** ve **erişim anahtarı** alanlarını doldurun → **Bağlan**.
2. İlk kurulum ekranında **yönetici şifresi** belirleyin ve **üye isimlerini** yazın.
3. **Ayarlar → Üye bağlantı linkini kopyala** (önce yönetici girişi gerekir). Bu linki üyelere gönderin; açan bilgisayar otomatik bağlanır, anahtar adres çubuğundan silinir.

## 5. Siteyi yayınlama (ücretsiz)
`app` klasöründe `npm install` ve `npm run build` çalıştırın; oluşan `dist` klasörünü
[Cloudflare Pages](https://pages.cloudflare.com) veya GitHub Pages'e yükleyin. Tarayıcıda (Chrome/Edge)
adres çubuğundaki **Uygulamayı yükle** ile masaüstü uygulaması gibi kullanılır.

## Bilmeniz gerekenler
- **Hız:** Uygulama verinin bir kopyasını bilgisayarda tutar, anında açılır. Değişiklikler arka planda e-tabloya gider, diğer bilgisayarlar ~20 saniyede görür.
- **İnternet kesilirse** çalışmaya devam edebilirsiniz; değişiklikler bağlantı gelince gönderilir (sol altta "bekliyor" yazar).
- **Aynı anda aynı ürünü** iki kişi düzenlerse son kaydeden kazanır.
- **İsimle giriş kimlik doğrulama değildir:** linke erişen biri başkasının ismini seçebilir. Yönetici şifresi yalnızca arayüzde üye/ayar yönetimini korur; asıl koruma erişim anahtarıdır.
- **Yedek:** e-tabloda *Dosya → Sürüm geçmişi* ile eski hallere dönebilir, *Dosya → İndir → Excel* ile yedek alabilirsiniz.

## Güncelleme: haftalık e-posta özeti (isteğe bağlı)

Uygulama her yeni sürümde otomatik güncellenir, ama **E-Tablodaki Apps Script kodu elle** güncellenir. E-posta özeti için:

1. E-tabloda **Uzantılar → Apps Script**; `Code.gs` içindeki her şeyi silip bu klasördeki `apps-script/Code.gs` dosyasının güncel içeriğini yapıştırın → **Kaydet**.
2. **Dağıt → Dağıtımları yönet → ✏ → Sürüm: Yeni sürüm → Dağıt** (URL ve anahtar **değişmez**).
3. Fonksiyon listesinden **`haftalikOzetKur`** seçip **Çalıştır**. E-posta gönderme izni ister (*Gelişmiş → … sayfasına git → İzin ver*). Bu, her sabah ~08:00'de çalışan bir zamanlayıcı kurar; e-posta yalnızca sizin seçtiğiniz gün gider.
4. Uygulamada **Ayarlar → Haftalık e-posta özeti** (yönetici girişiyle): alıcıları, günü ve yedek eklenip eklenmeyeceğini seçip **Kaydet**.
5. Denemek için Apps Script'te **`testEposta`** fonksiyonunu çalıştırın; gün beklemeden şimdi bir e-posta gönderir.

E-posta Google hesabınızdan gider (günlük 100 e-posta sınırı vardır, bu kullanım için fazlasıyla yeter). Yedek ekliyse e-postadaki `.json` dosyasını uygulamada **Ayarlar → Dosyadan veri içe aktar → Yedekten geri yükle** ile geri yükleyebilirsiniz.

## Okul / kurum ağı script.google.com'u engelliyorsa (aracı kurulumu)

Belirti: başka bir internette (ör. telefon hotspot'u) uygulama bağlanıyor, okul ağında "Sunucuya ulaşılamıyor" diyor.
Çözüm iki yoldan biridir:

- **Kolay:** Okulun bilgi işlemine `script.google.com` ve `script.googleusercontent.com` adreslerine izin verilmesini isteyin (Google'ın kendi Apps Script hizmetidir).
- **Kendi çözümünüz:** Ücretsiz bir **Cloudflare Worker** aracısı. Ağ yalnızca aracının adresini görür; aracı isteği Google'a iletir. Anahtar yine Apps Script'te doğrulanır, aracı hiçbir veri saklamaz.

Aracı kurulumu (bir kez, ~5 dakika):
1. [dash.cloudflare.com](https://dash.cloudflare.com) üzerinden ücretsiz hesap açın → **Workers & Pages → Create → Create Worker** → bir ad verin (ör. `lab-stok`) → **Deploy**.
2. **Edit code**: içindeki her şeyi silip `apps-script/relay-worker.js` dosyasının içeriğini yapıştırın. En üstteki `TARGET` satırına Apps Script'in `…/exec` adresini yazın → **Deploy**.
3. Worker'ın adresini (`https://lab-stok.….workers.dev`) kopyalayın. Tarayıcıda açınca "Lab Stok aracısı çalışıyor." yazmalı.
4. Uygulamada **Ayarlar → Görünüm ve bağlantı → Bağlantı adresini değiştir** bölümüne bu adresi yazın. Yerel veri ve gönderilmemiş değişiklikler korunur. Diğer bilgisayarlar için **Üye bağlantı linkini kopyala** ile yeni linki alıp gönderin.

Not: okul bu adresi de engellerse (`workers.dev`), ilk yöntem kalır.
