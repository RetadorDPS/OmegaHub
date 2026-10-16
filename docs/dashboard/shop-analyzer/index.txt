1:"$Sreact.fragment"
3:"/OmegaHub/_next/static/chunks/42onvq6nokjl2.js"
4:"/OmegaHub/_next/static/chunks/1mry0oilanjne.js"
5:I[26732,["$3","$4"],"SessionProvider"]
6:I[39756,["$3","$4"],"default"]
7:I[37457,["$3","$4"],"default"]
8:I[46696,["$3","$4"],"Toaster"]
13:I[68027,["$3","$4"],"default",1]
:HL["/OmegaHub/_next/static/chunks/1ztj9zi4mj4pm.css","style"]
2:T433,(function () {
  var sesion = { user: { name: "Ariadna Ferrer", email: "admin@trendhunter.pro", role: "ADMIN", planType: "BUSINESS" }, expires: "2099-12-31T23:59:59.999Z" };
  var aviso = "Estás viendo la versión estática publicada en GitHub Pages: esta acción necesita el servidor de TrendHunter Pro.";
  var original = window.fetch.bind(window);
  function respuesta(datos, estado) {
    return new Response(JSON.stringify(datos), { status: estado, headers: { "Content-Type": "application/json" } });
  }
  window.fetch = function (recurso, opciones) {
    var url = typeof recurso === "string" ? recurso : (recurso && recurso.url) || "";
    if (url.indexOf("/api/") !== -1) {
      if (url.indexOf("/api/auth/session") !== -1) return Promise.resolve(respuesta(sesion, 200));
      if (url.indexOf("/api/auth/csrf") !== -1) return Promise.resolve(respuesta({ csrfToken: "estatico" }, 200));
      return Promise.resolve(respuesta({ error: "Modo demostración estática", detalle: aviso, estatico: true }, 501));
    }
    return original(recurso, opciones);
  };
})();d:X
e:[["children",{"s":"__PAGE__","h":512,"d":{"r":"$Lf","p":false,"v":null}}]]
b:[["children",{"s":"shop-analyzer","h":512,"d":{"r":"$Lc","p":false,"v":"$d"},"c":"$Qe"}]]
9:[["children",{"s":"dashboard","h":512,"d":{"r":"$La","p":false,"v":null},"c":"$Qb"}]]
0:{"P":null,"c":["","dashboard","shop-analyzer",""],"q":"","i":false,"t":{"t":{"s":"","h":528,"d":{"r":["$","$1","c",{"children":[[["$","link","0",{"rel":"stylesheet","href":"/OmegaHub/_next/static/chunks/1ztj9zi4mj4pm.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}],["$","script","script-0",{"src":"/OmegaHub/_next/static/chunks/42onvq6nokjl2.js","async":true,"nonce":"$undefined"}],["$","script","script-1",{"src":"/OmegaHub/_next/static/chunks/1mry0oilanjne.js","async":true,"nonce":"$undefined"}]],["$","html",null,{"lang":"es","className":"dark","data-scroll-behavior":"smooth","suppressHydrationWarning":true,"children":["$","body",null,{"className":"min-h-screen antialiased","children":[["$","div",null,{"className":"border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200","children":[["$","span",null,{"className":"font-semibold","children":"Versión estática en GitHub Pages."}]," Datos reales del entorno de demostración; la IA, los filtros del servidor, el guardado y los pagos necesitan el backend."," ",["$","a",null,{"className":"underline underline-offset-2","href":"https://github.com/RetadorDPS/OmegaHub","children":"Abrir la aplicación completa"}]]}],["$","script",null,{"dangerouslySetInnerHTML":{"__html":"$2"}}],["$","$L5",null,{"session":{"user":{"id":"usuario-demostracion","name":"Ariadna Ferrer","email":"admin@trendhunter.pro","image":null,"role":"ADMIN","planType":"BUSINESS","isEmailVerified":true},"expires":"2099-12-31T23:59:59.999Z"},"children":[["$","$L6",null,{"parallelRouterKey":"children","error":"$undefined","errorStyles":"$undefined","errorScripts":"$undefined","template":["$","$L7",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":[[["$","title",null,{"children":"404: This page could not be found."}],["$","div",null,{"style":{"fontFamily":"system-ui,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif,\"Apple Color Emoji\",\"Segoe UI Emoji\"","height":"100vh","textAlign":"center","display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center"},"children":["$","div",null,{"children":[["$","style",null,{"dangerouslySetInnerHTML":{"__html":"body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}"}}],["$","h1",null,{"className":"next-error-h1","style":{"display":"inline-block","margin":"0 20px 0 0","padding":"0 23px 0 0","fontSize":24,"fontWeight":500,"verticalAlign":"top","lineHeight":"49px"},"children":404}],["$","div",null,{"style":{"display":"inline-block"},"children":["$","h2",null,{"style":{"fontSize":14,"fontWeight":400,"lineHeight":"49px","margin":0},"children":"This page could not be found."}]}]]}]}]],[]],"forbidden":"$undefined","unauthorized":"$undefined"}],["$","$L8",null,{"theme":"dark","position":"top-right","richColors":true,"closeButton":true,"toastOptions":{"classNames":{"toast":"border-border"}}}]]}]]}]}]]}],"p":false,"v":null},"c":"$Q9"},"h":{"r":["$","$1","h",{"children":["$L10","$L11","$L12",null]}],"p":false,"v":null}},"m":"$undefined","G":["$13",["$L14"]],"S":true,"r":"$undefined","s":"$undefined","a":"$undefined","l":"$undefined","p":"$undefined","d":"$undefined","b":"Tsdgse6WHPFDyftwbdxkR"}
17:I[97367,["$3","$4"],"OutletBoundary"]
18:"$Sreact.suspense"
1a:"ViewportBoundary"
1b:I[97367,["$3","$4"],"$1a"]
1d:"MetadataBoundary"
1e:I[97367,["$3","$4"],"$1d"]
a:["$","$1","c",{"children":[[["$","script","script-0",{"src":"/OmegaHub/_next/static/chunks/3j_d5tfkm0g6h.js","async":true,"nonce":"$undefined"}],["$","script","script-1",{"src":"/OmegaHub/_next/static/chunks/1lsrruh2-_nj7.js","async":true,"nonce":"$undefined"}],["$","script","script-2",{"src":"/OmegaHub/_next/static/chunks/2mhdbpsnt5ex9.js","async":true,"nonce":"$undefined"}],["$","script","script-3",{"src":"/OmegaHub/_next/static/chunks/0m468ffo1_f6p.js","async":true,"nonce":"$undefined"}],["$","script","script-4",{"src":"/OmegaHub/_next/static/chunks/1u0idxw23pmwy.js","async":true,"nonce":"$undefined"}],["$","script","script-5",{"src":"/OmegaHub/_next/static/chunks/0c2bd8qj8h7ct.js","async":true,"nonce":"$undefined"}]],"$L15"]}]
c:["$","$1","c",{"children":[null,["$","$L6",null,{"parallelRouterKey":"children","error":"$undefined","errorStyles":"$undefined","errorScripts":"$undefined","template":["$","$L7",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":"$undefined","forbidden":"$undefined","unauthorized":"$undefined"}]]}]
f:["$","$1","c",{"children":["$L16",[["$","script","script-0",{"src":"/OmegaHub/_next/static/chunks/1uwnlsjjc4wzc.js","async":true,"nonce":"$undefined"}]],["$","$L17",null,{"children":["$","$18",null,{"name":"Next.MetadataOutlet","children":"$@19"}]}]]}]
10:null
11:["$","$L1b",null,{"children":"$L1c"}]
12:["$","$L1e",null,{"children":[["$","div",null,{"hidden":true,"children":["$","$18",null,{"name":"Next.Metadata","children":"$L1f"}]}],null]}]
14:["$","link","0",{"rel":"stylesheet","href":"/OmegaHub/_next/static/chunks/1ztj9zi4mj4pm.css","precedence":"next","crossOrigin":"$undefined","nonce":"$undefined"}]
d:C
1c:[["$","meta","0",{"charSet":"utf-8"}],["$","meta","1",{"name":"viewport","content":"width=device-width, initial-scale=1"}],["$","meta","2",{"name":"theme-color","content":"#0b1020"}]]
19:null
1f:[["$","title","0",{"children":"Shop Analyzer · TrendHunter Pro"}],["$","meta","1",{"name":"description","content":"Analiza cualquier tienda Shopify: facturación, tráfico, top productos, categorías y tecnología."}],["$","meta","2",{"name":"author","content":"TrendHunter Pro"}],["$","meta","3",{"name":"keywords","content":"dropshipping,productos ganadores,investigación de productos,shopify,ads spy,tendencias ecommerce,trend score"}],["$","meta","4",{"name":"robots","content":"index, follow"}],["$","meta","5",{"property":"og:title","content":"TrendHunter Pro · Inteligencia de productos y tendencias"}],["$","meta","6",{"property":"og:description","content":"Descubre productos ganadores con datos de TikTok, Meta y Google. Analiza tiendas Shopify y genera tus creatividades con IA."}],["$","meta","7",{"property":"og:site_name","content":"TrendHunter Pro"}],["$","meta","8",{"property":"og:locale","content":"es_ES"}],["$","meta","9",{"property":"og:type","content":"website"}],["$","meta","10",{"name":"twitter:card","content":"summary_large_image"}],["$","meta","11",{"name":"twitter:title","content":"TrendHunter Pro"}],["$","meta","12",{"name":"twitter:description","content":"Inteligencia de mercado para dropshippers y e-commerce."}]]
20:"/OmegaHub/_next/static/chunks/3j_d5tfkm0g6h.js"
21:"/OmegaHub/_next/static/chunks/1lsrruh2-_nj7.js"
22:"/OmegaHub/_next/static/chunks/2mhdbpsnt5ex9.js"
23:"/OmegaHub/_next/static/chunks/0m468ffo1_f6p.js"
24:"/OmegaHub/_next/static/chunks/1u0idxw23pmwy.js"
25:"/OmegaHub/_next/static/chunks/0c2bd8qj8h7ct.js"
26:"/OmegaHub/_next/static/chunks/1uwnlsjjc4wzc.js"
27:"ShopAnalyzerClient"
28:I[31694,["$3","$4","$20","$21","$22","$23","$24","$25","$26"],"$27"]
16:[["$","div",null,{"className":"mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between","children":[["$","div",null,{"className":"space-y-1","children":[["$","h1",null,{"className":"text-2xl font-bold tracking-tight lg:text-3xl","children":"Shop Analyzer"}],["$","p",null,{"className":"max-w-2xl text-sm text-muted-foreground","children":"Introduce el dominio de una tienda de la competencia y obtén su facturación estimada, tráfico, catálogo completo y stack tecnológico."}]]}],"$undefined"]}],["$","$L28",null,{"seguidas":[]}]]
29:I[64553,["$3","$4","$20","$21","$22","$23","$24","$25"],"DashboardShell"]
15:["$","$L29",null,{"user":{"name":"Ariadna Ruiz","email":"admin@trendhunter.pro","image":null,"role":"ADMIN","planType":"BUSINESS"},"notifications":[{"id":"cmvaghmf300lysinzkk0klp4u","type":"SYSTEM","title":"Nuevos usuarios registrados","message":"6 usuarios nuevos esta semana, 2 con plan Pro.","read":false,"entityType":null,"entityId":null,"actionUrl":"/dashboard/admin","createdAt":"2026-10-16T00:17:00.350Z"},{"id":"cmvaghmf300lzsinznksotiue","type":"SYSTEM","title":"Scraping completado","message":"El scraping programado de 10 tiendas finalizó correctamente.","read":false,"entityType":null,"entityId":null,"actionUrl":"/dashboard/admin","createdAt":"2026-10-15T17:17:00.350Z"},{"id":"cmvaghmf300m0sinz30vx6f4p","type":"SUBSCRIPTION","title":"Ingreso recurrente","message":"MRR estimado: 1.244 $ (4 suscripciones activas de pago).","read":true,"entityType":null,"entityId":null,"actionUrl":"/dashboard/admin","createdAt":"2026-10-15T08:17:00.350Z"}],"unreadCount":2,"children":["$","$L6",null,{"parallelRouterKey":"children","error":"$undefined","errorStyles":"$undefined","errorScripts":"$undefined","template":["$","$L7",null,{}],"templateStyles":"$undefined","templateScripts":"$undefined","notFound":"$undefined","forbidden":"$undefined","unauthorized":"$undefined"}]}]
