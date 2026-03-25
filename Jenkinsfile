pipeline {
    agent any

    stages {
        stage('Install Dependencies') {
            steps {
                sh '''
                echo "📦 安装依赖..."
                npm install
                '''
            }
        }

        stage('Fix Webpack Permission') {
            steps {
                sh '''
                echo "🔓 修复 webpack 执行权限..."
                chmod +x node_modules/.bin/webpack
                '''
            }
        }

        stage('Build ThreeDViewer.bundle.js') {
            steps {
                sh '''
                echo "🛠️ 执行 npm run build..."
                npm run build

                echo "📂 查看 dist/ 目录打包结果："
                ls -lh dist/
                '''
            }
        }


        stage('Clean Old Deployment') {
            steps {
                sh '''
                echo "🧹 清理旧部署目录..."
                sudo rm -rf /var/www/html/*
                '''
            }
        }

        stage('Copy Static Files to Server') {
            steps {
                sh '''
                echo "📤 拷贝根目录首页 index.html..."
                sudo cp ./index.html /var/www/html/

                echo "📤 拷贝静态资源目录..."
                sudo cp -r ./css /var/www/html/
                sudo cp -r ./assets /var/www/html/

                echo "📤 拷贝 HTML 页面（保留 src/pages 路径）..."
                sudo cp --parents ./src/pages/*.html /var/www/html/

                echo "📤 拷贝 JS 脚本（保留 src/js 路径）..."
                sudo cp --parents ./src/js/*.js /var/www/html/

                echo "📤 拷贝其它非 src/js 的核心 JS（如 index.js、ApiClient.js）..."
                sudo cp --parents ./src/*.js /var/www/html/

                echo "📤 拷贝打包的 bundle.js..."
                sudo cp ./dist/bundle.js /var/www/html/
                '''
            }
        }
    }

    post {
        success {
            echo '✅ 部署完成，请访问：'
            echo '🔗 http://<your-ec2-ip>/index.html'
            echo '🔗 http://<your-ec2-ip>/src/pages/case_list.html'
            echo '🔗 http://<your-ec2-ip>/src/pages/ThreeDViewer.html'
        }
        failure {
            echo '❌ 构建失败，请检查日志'
        }
    }
}
