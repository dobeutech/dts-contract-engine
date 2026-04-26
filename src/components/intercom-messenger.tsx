"use client";

import Script from "next/script";

interface Props {
  appId?: string;
  user?: {
    name?: string | null;
    email?: string | null;
    company?: string | null;
  };
}

export function IntercomMessenger({ appId, user }: Props) {
  if (!appId) return null;
  const settings = {
    api_base: "https://api-iam.intercom.io",
    app_id: appId,
    name: user?.name ?? undefined,
    email: user?.email ?? undefined,
    company: user?.company ? { name: user.company } : undefined,
  };

  return (
    <>
      <Script id="intercom-settings" strategy="afterInteractive">
        {`window.intercomSettings = ${JSON.stringify(settings)};`}
      </Script>
      <Script id="intercom-loader" strategy="afterInteractive">
        {`(function(){var w=window;var ic=w.Intercom;if(typeof ic==="function"){ic('reattach_activator');ic('update',w.intercomSettings);}else{var d=document;var i=function(){i.c(arguments);};i.q=[];i.c=function(args){i.q.push(args);};w.Intercom=i;var l=function(){var s=d.createElement('script');s.type='text/javascript';s.async=true;s.src='https://widget.intercom.io/widget/${appId}';var x=d.getElementsByTagName('script')[0];x.parentNode.insertBefore(s,x);};if(document.readyState==='complete'){l();}else if(w.attachEvent){w.attachEvent('onload',l);}else{w.addEventListener('load',l,false);}}})();`}
      </Script>
    </>
  );
}
