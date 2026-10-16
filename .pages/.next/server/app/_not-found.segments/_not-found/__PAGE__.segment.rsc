1:"$Sreact.fragment"
3:"/OmegaHub/_next/static/chunks/42onvq6nokjl2.js"
4:"/OmegaHub/_next/static/chunks/1mry0oilanjne.js"
5:I[26732,["$3","$4"],"SessionProvider"]
6:I[39756,["$3","$4"],"default"]
7:I[37457,["$3","$4"],"default"]
8:I[46696,["$3","$4"],"Toaster"]
12:"ViewportBoundary"
13:I[97367,["$3","$4"],"$12"]
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
})();a:X
d:X
d:C
e:[["children",{"s":"__PAGE__","h":160,"d":{"r":["$","$1","c",{"children":[[["$","title",null,{"children":"404: This page could not be found."}],"$Lf"],null,"$L10"]}],"p":"$@11","v":null,"s":"$a"}}]]
b:[["children",{"s":"/_not-found","h":96,"d":{"r":["$","$1","c",{"children":[null,["$","$L6",null,{"parallelRouterKey":"children","template":["$","$L7",null,{}]}]]}],"p":"$@c","v":"$d","s":"$a"},"c":"$Qe"}]]
0:{"t":{"t":{"s":"","h":80,"d":{"r":["$","$1","c",{"children":[[["$","link","0",{"rel":"stylesheet","href":"/OmegaHub/_next/static/chunks/1ztj9zi4mj4pm.css","precedence":"next"}],["$","script","script-0",{"src":"/OmegaHub/_next/static/chunks/42onvq6nokjl2.js","async":true}],["$","script","script-1",{"src":"/OmegaHub/_next/static/chunks/1mry0oilanjne.js","async":true}]],["$","html",null,{"lang":"es","className":"dark","data-scroll-behavior":"smooth","suppressHydrationWarning":true,"children":["$","body",null,{"className":"min-h-screen antialiased","children":[["$","div",null,{"className":"border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200","children":[["$","span",null,{"className":"font-semibold","children":"Versión estática en GitHub Pages."}]," Datos reales del entorno de demostración; la IA, los filtros del servidor, el guardado y los pagos necesitan el backend."," ",["$","a",null,{"className":"underline underline-offset-2","href":"https://github.com/RetadorDPS/OmegaHub","children":"Abrir la aplicación completa"}]]}],["$","script",null,{"dangerouslySetInnerHTML":{"__html":"$2"}}],["$","$L5",null,{"session":{"user":{"id":"usuario-demostracion","name":"Ariadna Ferrer","email":"admin@trendhunter.pro","image":null,"role":"ADMIN","planType":"BUSINESS","isEmailVerified":true},"expires":"2099-12-31T23:59:59.999Z"},"children":[["$","$L6",null,{"parallelRouterKey":"children","template":["$","$L7",null,{}],"notFound":[[["$","title",null,{"children":"404: This page could not be found."}],["$","div",null,{"style":{"fontFamily":"system-ui,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif,\"Apple Color Emoji\",\"Segoe UI Emoji\"","height":"100vh","textAlign":"center","display":"flex","flexDirection":"column","alignItems":"center","justifyContent":"center"},"children":["$","div",null,{"children":[["$","style",null,{"dangerouslySetInnerHTML":{"__html":"body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}"}}],["$","h1",null,{"className":"next-error-h1","style":{"display":"inline-block","margin":"0 20px 0 0","padding":"0 23px 0 0","fontSize":24,"fontWeight":500,"verticalAlign":"top","lineHeight":"49px"},"children":404}],["$","div",null,{"style":{"display":"inline-block"},"children":["$","h2",null,{"style":{"fontSize":14,"fontWeight":400,"lineHeight":"49px","margin":0},"children":"This page could not be found."}]}]]}]}]],[]]}],["$","$L8",null,{"theme":"dark","position":"top-right","richColors":true,"closeButton":true,"toastOptions":{"classNames":{"toast":"border-border"}}}]]}]]}]}]]}],"p":"$@9","v":null,"s":"$a"},"c":"$Qb"},"h":{"r":["$","$1","h",{"children":[["$","meta",null,{"name":"robots","content":"noindex"}],["$","$L13",null,{"children":[["$","meta","0",{"charSet":"utf-8"}],["$","meta","1",{"name":"viewport","content":"width=device-width, initial-scale=1"}],["$","meta","2",{"name":"theme-color","content":"#0b1020"}]]}],"$L14",null]}],"p":"$@15","v":null,"s":"$a"}},"a":"$@16","u":"$@17","b":"z38FR2nEgzJqP7fk8zxoZ"}
18:I[97367,["$3","$4"],"OutletBoundary"]
19:"$Sreact.suspense"
1b:"MetadataBoundary"
1c:I[97367,["$3","$4"],"$1b"]
f:["$","div",null,{"style":"$0:t:t:d:r:props:children:1:props:children:props:children:2:props:children:0:props:notFound:0:1:props:style","children":["$","div",null,{"children":[["$","style",null,{"dangerouslySetInnerHTML":{"__html":"body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}"}}],["$","h1",null,{"className":"next-error-h1","style":"$0:t:t:d:r:props:children:1:props:children:props:children:2:props:children:0:props:notFound:0:1:props:children:props:children:1:props:style","children":404}],["$","div",null,{"style":"$0:t:t:d:r:props:children:1:props:children:props:children:2:props:children:0:props:notFound:0:1:props:children:props:children:2:props:style","children":["$","h2",null,{"style":"$0:t:t:d:r:props:children:1:props:children:props:children:2:props:children:0:props:notFound:0:1:props:children:props:children:2:props:children:props:style","children":"This page could not be found."}]}]]}]}]
10:["$","$L18",null,{"children":["$","$19",null,{"name":"Next.MetadataOutlet","children":"$@1a"}]}]
14:["$","$L1c",null,{"children":[["$","div",null,{"hidden":true,"children":["$","$19",null,{"name":"Next.Metadata","children":[["$","title","0",{"children":"TrendHunter Pro · Inteligencia de productos para e-commerce"}],["$","meta","1",{"name":"description","content":"Encuentra productos ganadores, espía anuncios, analiza tiendas Shopify y genera creatividades con IA. La plataforma de investigación de mercado para dropshippers y e-commerce."}],["$","meta","2",{"name":"author","content":"TrendHunter Pro"}],["$","meta","3",{"name":"keywords","content":"dropshipping,productos ganadores,investigación de productos,shopify,ads spy,tendencias ecommerce,trend score"}],["$","meta","4",{"name":"robots","content":"index, follow"}],["$","meta","5",{"property":"og:title","content":"TrendHunter Pro · Inteligencia de productos y tendencias"}],["$","meta","6",{"property":"og:description","content":"Descubre productos ganadores con datos de TikTok, Meta y Google. Analiza tiendas Shopify y genera tus creatividades con IA."}],["$","meta","7",{"property":"og:site_name","content":"TrendHunter Pro"}],["$","meta","8",{"property":"og:locale","content":"es_ES"}],["$","meta","9",{"property":"og:type","content":"website"}],["$","meta","10",{"name":"twitter:card","content":"summary_large_image"}],["$","meta","11",{"name":"twitter:title","content":"TrendHunter Pro"}],["$","meta","12",{"name":"twitter:description","content":"Inteligencia de mercado para dropshippers y e-commerce."}]]}]}],null]}]
a:300
1a:null
17:true
a:C
16:0
c:"$undefined"
9:"$undefined"
15:"$undefined"
11:"$undefined"
