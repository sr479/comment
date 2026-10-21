#!/bin/sh
# 仅在本站证书续期后校验并平滑重载 Nginx。
case " ${RENEWED_DOMAINS:-} " in
  *" pingjia.xiangzhen.site "*)
    /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx
    ;;
esac
