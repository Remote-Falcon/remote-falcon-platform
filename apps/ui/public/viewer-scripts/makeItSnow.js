// widget by Embed.im (Licenses & Credits: https://app.embed.im/licenses.txt)
(function () {
  'use strict';

  function start() {
    if (document.getElementById("embedim--snow")) return;

    function embRand2(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    function embRandColor2() {
      var items = [
        "radial-gradient(circle at top left,#dcf2fd,#60b4f2)",
        "#dbf2fd",
        "#d8f8ff",
        "#b8ddfa",
      ];
      return items[Math.floor(Math.random() * items.length)];
    }

    var embCSS =
      ".embedim-snow{position: absolute;width: 10px;height: 10px;background: white;border-radius: 50%;margin-top:-10px}";
    var embHTML = "";
    for (let i = 1; i < 200; i++) {
      embHTML += '<i class="embedim-snow"></i>';
      var rndX = embRand2(0, 1e6) * 1e-4,
        rndO = embRand2(-1e5, 1e5) * 1e-4,
        rndT = (embRand2(3, 8) * 10).toFixed(2),
        rndS = (embRand2(0, 1e4) * 1e-4).toFixed(2);
      embCSS +=
        ".embedim-snow:nth-child(" +
        i +
        "){background:" +
        embRandColor2() +
        ";opacity:" +
        (embRand2(1, 1e4) * 1e-4).toFixed(2) +
        ";transform:translate(" +
        rndX.toFixed(2) +
        "vw,-10px) scale(" +
        rndS +
        ");animation:fall-" +
        i +
        " " +
        embRand2(10, 30) +
        "s -" +
        embRand2(0, 30) +
        "s linear infinite}@keyframes fall-" +
        i +
        "{" +
        rndT +
        "%{transform:translate(" +
        (rndX + rndO).toFixed(2) +
        "vw," +
        rndT +
        "vh) scale(" +
        rndS +
        ")}to{transform:translate(" +
        (rndX + rndO / 2).toFixed(2) +
        "vw, 105vh) scale(" +
        rndS +
        ")}}";
    }
    var embedimSnow = document.createElement("div");
    embedimSnow.id = "embedim--snow";
    embedimSnow.innerHTML =
      "<style>#embedim--snow{position:fixed;left:0;top:0;bottom:0;width:100vw;height:100vh;overflow:hidden;z-index:9999999;pointer-events:none}" +
      embCSS +
      "</style>" +
      embHTML;
    document.body.appendChild(embedimSnow);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
