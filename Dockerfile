# 使用官方轻量 nginx 镜像
FROM nginx:alpine

# 删除默认 nginx 页面
RUN rm -rf /usr/share/nginx/html/*

# 拷贝前端静态资源（包含你上传的页面）
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY assets/ /usr/share/nginx/html/assets/
COPY dist/ /usr/share/nginx/html/dist/
COPY src/ /usr/share/nginx/html/src/

# 开放 nginx 默认端口
EXPOSE 80

# 启动 nginx 服务
CMD ["nginx", "-g", "daemon off;"]
