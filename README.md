# BUNKERLYPSO — 2D Zombie Survival

Sıfırdan, hiçbir harici oyun motoru veya kütüphane kullanılmadan saf **HTML5 Canvas**, **CSS3** ve **modüler Vanilla JavaScript** ile geliştirilmiş tepeden bakışlı (top-down) post-apokaliptik zombi hayatta kalma oyunu. Dosyalar build adımı olmadan, klasik `<script>` etiketleriyle sırayla yüklenir.

---

## 🎮 Nasıl Başlatılır?

Projeyi çalıştırmak için 3 kolay yol vardır:

### 1. Yol: Doğrudan `index.html` Dosyasına Çift Tıklayarak (En Hızlısı)
Hiçbir sunucu veya terminal gerektirmeden, **`index.html`** dosyasına doğrudan çift tıklayarak varsayılan tarayıcınızda (Chrome, Edge, Firefox, Opera vb.) oyunu anında başlatabilirsiniz.

### 2. Yol: `start_game.bat` ile Başlatma
Proje klasöründeki **`start_game.bat`** dosyasına çift tıklayın. Sisteminizde Python varsa yerel sunucu (`http://localhost:8000`) üzerinden, yoksa doğrudan tarayıcınızda oyunu açacaktır.

### 3. Yol: Terminalden Başlatma
Proje dizininde PowerShell veya CMD açıp şu komutu çalıştırın:
```bash
python -m http.server 8000
```
Ardından tarayıcınızdan **`http://localhost:8000`** adresine gidin.

> Not: Arayüz yazı tipleri `style.css` içinde Google Fonts'tan `@import` ile çekilir. İnternet yoksa sistem yazı tipine düşer; oyunun kendisi tamamen çevrimdışı çalışır.

---

## 🕹️ Kontroller

### 💻 Masaüstü (Klavye & Fare)
| Tuş | İşlev |
| :--- | :--- |
| **W, A, S, D** | Karakter Hareketi (Sığınak içinde yürüme) |
| **Fare (Mouse)** | Flashlight (El feneri) ve Silah Nişanı |
| **Sol Tık (LMB)** | Ateş Etme (Tekli / Seri) |
| **R** | Şarjör Değiştirme (Reload) |
| **F** | Etkileşim: Pencereleri Tamir Etme / Duvar Silahı Alma / Kapı Açma / Gizemli Kutu / Juggernog |
| **V** veya **Orta Tık** | Yakın Dövüş Bıçak Darbesi (**+130 Puan**) |
| **1, 2** veya **Tekerlek** | Silah Değiştirme (Maksimum 2 silah taşıma kapasitesi) |
| **ESC** veya **P** | Oyunu Duraklatma (Pause) / Ayarlar Menüsü |
| **~ (Tilde)** veya **F1** | Geliştirici Hile Menüsü (Dev Cheats Console) |

### 📱 Mobil & Tablet (Dokunmatik Kontroller)
> **Akıllı Algılama:** Dokunmatik kontroller **yalnızca mobil cihaz algılandığında** otomatik olarak görünür. Masaüstünde fare ve klavye deneyimi hiçbir şekilde bozulmaz. Ayarlar menüsünden mod (Otomatik / Her Zaman Açık / Kapalı) ve Akıllı Nişan Yardımı (Aim Assist) ayarlanabilir.

| Dokunmatik Kontrol | İşlev |
| :--- | :--- |
| **Sol Analog Joystick** | Dinamik/Yüzen 360° Akıcı Karakter Hareketi |
| **Sağ Analog / Ekrana Dokunma** | 360° Nişan Alma & Akıllı Zombi Nişan Desteği (Aim Assist) |
| **Kırmızı Ateş Butonu (FIRE)** | Ateş Etme (Basılı tutarak seri atış) |
| **Şarjör Butonu [↻] (RELOAD)** | Şarjör Doldurma (R) |
| **Etkileşim Butonu [F] (ACTION)** | Pencereleri Tamir Etme (Basılı tutma) / Kapı ve Silah Satın Alma |
| **Bıçak Butonu [⚔] (KNIFE)** | Yakın Dövüş Darbesi (V) |
| **Silah Değiştir [⇄] (WEAPON)** | 1. ve 2. Silah Arasında Geçiş |
| **Üst Bar [⏸] / [⛶]** | Oyunu Duraklatma ve Tam Ekran Modu |

---

## 🩸 Özellikler ve Mekanikler

### 1. Ana Menü, Duraklatma (Pause) & Ayarlar
* **BUNKERLYPSO Ana Menüsü:** Oyun doğrudan başlamaz; yeni şık ana menü üzerinden ayarları yapılandırabilir veya savaşa girebilirsiniz.
* **Duraklatma Ekranı (ESC / P):** Oyun esnasında dilediğiniz an oyunu dondurabilir, ayarlara girebilir veya ana menüye dönebilirsiniz.
* **Detaylı Ses Ayarları:**
  - Genel Ses (Master Volume)
  - Silah & Efekt Sesleri (Weapons & SFX)
  - Sığınak Ortam/Uğultu Sesi (Ambience Volume)
* **Aydınlık / Güvenli Mod (Safe Mode):** Ayarlar menüsünden el feneri ışık konisi ve karanlık maskesi tek tıkla kapatılabilir. Karanlıktan ve kısıtlı görüşten hoşlanmayanlar için haritayı bütünüyle aydınlatan güvenli mod sunulmuştur.
* **Nacht der Untoten Mimarisi (4 oda, 9 barikat penceresi):**
  * **Spawn Odası (Komuta Merkezi):** 3 adet tahta barikatlı pencere, destek kolonları, Kar98k ve M1911 mermi tebeşir çizimleri.
  * **Kilitli Enkaz/Kapı:** 1000 puan karşılığında `F` tuşuyla temizlenerek koridoru ve cephaneliği açar.
  * **Cephanelik (Mystery Vault):** MP40 tebeşir silahı, **Mystery Box (Gizemli Kutu)**, **Juggernog Otomatı** ve 1 adet barikat penceresi.
  * **Alt Sığınak (Jeneratör Laboratuvarı):** 750 puanlık güney kapısıyla açılır; 2 barikat penceresi.
  * **B2 Alt Kat (Yeraltı Cephaneliği):** Merdiven enkazı temizlenince açılır; MG42 tebeşiri ve 3 barikat penceresi.
* **Barikat Sistemi:** Zombiler dışarıdan gelerek pencerelerdeki 5 tahtayı teker teker söker ve içeri atlar. Oyuncu yaklaşıp `F` tuşuna basılı tutarak tahtaları tamir eder (+10 puan / tahta, raunt başına 500 puan limiti).

### 3. Silah Cephaneliği
* **Colt M1911:** Başlangıç tabancası. 8 mermi, yüksek puan kasma potansiyeli.
* **Kar98k:** Duvar silahı (200 Puan). Tek atışta ölümcül sürgülü tüfek.
* **MP40:** Duvar silahı (1000 Puan). Yüksek atış hızlı tam otomatik makineli tabanca.
* **Trench Gun:** Duvar silahı (1200 Puan). Yakın mesafede 8 saçma saçan pompalı tüfek.
* **MG42:** Gizemli Kutu'dan veya B2 alt katındaki tebeşir duvarından (2500 Puan) alınabilir. 100 mermilik şarjör, dehşet verici seri atış.
* **Ray Gun (Harika Silah):** Yalnızca Gizemli Kutu'dan çıkar. Yeşil plazma halkaları fırlatır, çarptığı yerde alan hasarı (splash damage) ve patlama ışığı oluşturur!

### 4. Perk ve Güçlendiriciler (Power-ups)
* **Juggernog (Nugi):** Can kapasitesini ve dayanıklılığı artırır. Kalıcı perk geliştirme seviyesine göre 175 HP'den 350 HP'ye ve Kalkan Patlamasına kadar güçlenir.
* **Speed Cola (Spodi):** Şarjör değiştirme hızını, silah çekme hızını ve seri ateşi artırır.
* **Max Ammo:** Tüm silahların yedek mermilerini fuller.
* **Insta-Kill:** 30 saniye boyunca tüm silah ve bıçak vuruşları zombileri tek vuruşta yok eder.
* **Nuke:** Haritadaki tüm aktif zombileri havaya uçurur, güçlü bir patlama ışığı/flaşı oluşturur ve +400 puan kazandırır.
* **Double Points:** 30 saniye boyunca kazanılan tüm puanları 2 ile çarpar.

### 5. 🎖️ RPG Elementleri & Kalıcı Geliştirme Sistemi (Bullet Coins & Cephanelik)
* **Kalıcı Para Birimi — BC (Bullet Coins):** Her maç sonunda gösterilen performansla kazanılan özel mermi kredisi birimi.
  - Zombi leşi başına: **+1 BC**
  - Kafa vuruşu (Headshot) başına: **+1 Ekstra BC**
  - Tamamlanan her raunt başına: **10 BC + (Raunt x 2) BC**
  - Her 5 barikat tamiri için: **+1 BC**
  - Tüm BC'ler tarayıcıda (`localStorage`) kalıcı olarak saklanır.
* **4 Kademeli Renk Kodlu Perk Geliştirme (Armory / Cephanelik):**
  - 🟩 **1. Seviye — Sahra Standardı (Yeşil // Varsayılan):**
    - *Nugi:* 175 HP Can Kapasitesi (Normal 100), 4.2s iyileşme gecikmesi.
    - *Spodi:* %35 Daha Hızlı Şarjör Doldurma (1.35x).
  - 🟦 **2. Seviye — Taktiksel Takviye (Mavi // 400 BC):**
    - *Nugi:* 225 HP Can Kapasitesi + İyileşme 3.2 saniyede başlar (1 sn daha erken).
    - *Spodi:* %55 Daha Hızlı Şarjör + Silah Değiştirme (Switch Weapon) anında gerçekleşir.
  - 🟪 **3. Seviye — Seçkin Operasyon (Mor // 1,500 BC):**
    - *Nugi:* 275 HP Can Kapasitesi + 100 HP/s Hızlı İyileşme + Darbe anında zombileri sersemletme (stagger).
    - *Spodi:* %75 Hızlı Şarjör + Bıçak darbesi (Knife) bekleme süresi %40 azalır.
  - 🟨 **4. Seviye — Kıyamet Prototipi (Sarı/Altın // 3,500 BC):**
    - *Nugi:* **350 HP Can Kapasitesi** (Tam bir tank!) + 2.0s yenilenme gecikmesi (130 HP/s) + **Kalkan Şok Dalgası:** Can %35 altına indiğinde etraftaki tüm zombileri geriye savuran kinetik şok patlaması!
    - *Spodi:* **%100 Yıldırım Şarjör (2.0x)** + Kalıcı **+%15 Koşu/Hareket Hızı** + Şarjör değiştirdikten sonra 3 saniye boyunca **+%25 Seri Ateş (Rapid Fire)**!
* **Askeri Rütbe Sistemi (Military Ranks):** Er'den Kıyamet Mareşali'ne kadar 13 kademeli rütbe ilerlemesi ve XP çubuğu.
* **Kariyer İstatistikleri (Stats Ekranı):**
  - Toplam oynanan maç, en yüksek raunt rekoru, leş, kafa vuruşu, headshot isabet yüzdesi, toplanan puan, tamir sayısı, toplam toplanan BC ve hayatta kalınan süre sicili.

### 6. Web Audio API Ses Motoru
Prosedürel sentez katmanları ve `assets/audio/audio_data.js` içine gömülü gerçek kayıtlar birlikte kullanılır:
* Tok ve yankılı silah patlamaları, sürgü çekme ve şarjör takma sesleri.
* Tahta kırılma ve çivi çakma sesleri.
* Zombi hırıltıları, inlemeleri ve vahşi saldırı pençesi sesleri.
* Klasik Call of Duty raunt geçişi akoru ve ürkütücü piyano dissonansı.
* Sığınakta esen rüzgar ve derin frekanslı uğultu ambiyansı.
* Juggernog mini jingle'ı, Gizemli Kutu kutu müziği ve satın alma çanları.

---

## 📁 Proje Dosya Mimarisi

```
cod zombies 2d/
├── index.html                 # Ana sayfa, HUD katmanları, menüler ve ekran kaplamaları
├── start_game.bat             # Tek tıkla yerel sunucu ve tarayıcı başlatıcı
├── README.md                  # Dokümantasyon
├── assets/                    # Oyun Varlıkları (Assets)
│   ├── css/
│   │   └── style.css          # Askeri tipografi, CRT vinyet, film greni, HUD ve UI stilleri
│   └── audio/
│       └── audio_data.js      # Gömülü yüksek kaliteli ses örnekleri (Kenney & Freesound)
└── src/                       # Modüler Oyun Motoru Kaynak Kodları
    ├── weapons.js             # Silah tanımları, balistik ve mermi simülasyonu
    ├── audio.js               # Prosedürel Web Audio API ses motoru & efekt yöneticisi
    ├── particles.js           # Kan lekeleri, kovanlar, kıvılcımlar ve savaş yazıları
    ├── hud.js                 # Minimalist WaW arayüzü, Romen rakamlı raunt göstergesi
    ├── lighting.js            # Dinamik el feneri, sarı zombi gözleri ve ışık motoru
    ├── map.js                 # Nacht der Untoten harita geometrisi, barikatlar & kapılar
    ├── zombie.js              # Zombi yapay zekası, sürü davranışı ve durum makineleri
    ├── progression.js         # BC (Bullet Coins), Perk yükseltmeleri, rütbe ve istatistikler
    ├── player.js              # Oyuncu fiziği, nişan alma, envanter, sağlık ve etkileşim
    └── main.js                # Ana oyun döngüsü, dalga yönetimi ve render hattı
```
