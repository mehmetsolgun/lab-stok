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
