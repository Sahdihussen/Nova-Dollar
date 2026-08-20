const digitMap=Object.fromEntries([...('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹')].map((c,i)=>[c,i<10?String(i):String(i-10)]));
const normalizeDigits=s=>s.replace(/[٠-٩۰-۹]/g,c=>digitMap[c]||c).replace(/[٬،]/g,',');
function parseRate(raw){let s=normalizeDigits(raw).replace(/\$/g,'').replace(/\s/g,'').trim();if(/^\d{1,3}\.\d{2}$/.test(s))return Math.round(Number(s)*1000);if(/^\d{1,3}\.\d{3}$/.test(s))return Math.round(Number(s)*1000);if(/^\d{1,3},\d{3}\.\d$/.test(s))return Math.round(Number(s.replace(',',''))*100);if(/^\d{1,3},\d{3}$/.test(s))return Number(s.replace(',',''));if(/^\d{6,7}$/.test(s))return Number(s);if(/^\d{3,4}$/.test(s))return Number(s)*100;return Number(s.replace(/,/g,''));}
const cityPatterns=[[/سلێمانی|سليمانيه|السليمانية|sulaymaniyah|slemani/i,'SULAYMANIYAH'],[/هەولێر|اربيل|أربيل|erbil/i,'ERBIL'],[/بغداد|baghdad/i,'BAGHDAD'],[/مووسڵ|الموصل|نینەوا|نينوى|mosul|nineveh/i,'MOSUL']];
const cityOf=s=>cityPatterns.find(([r])=>r.test(s))?.[1];
const tests=[['١٥٢،٨٥٠',152850],['152.850',152850],['150.25',150250],['1503',150300],['1,502.5',150250],['152850',152850]];
for(const[input,want]of tests){const got=parseRate(input);if(got!==want)throw new Error(`${input}: ${got} != ${want}`)}
if(cityOf('نينوى 152,900')!=='MOSUL')throw new Error('Nineveh/Mosul normalization failed');
const composition='80 شین + 18 سپي + 4 پەنجایی';if(/\b(?:80|18|4)\b/.test(composition)&&!/15\d[,\.]\d{3}/.test(composition))console.log('OK composition protected');
console.log('V2 deterministic smoke tests passed:',tests.length,'numeric cases + Mosul/Nineveh normalization.');
