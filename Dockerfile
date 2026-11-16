# ---- React front end ----
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
# vite.config.ts writes to ../Netipam/wwwroot/app
RUN mkdir -p /Netipam && npm run build

# ---- .NET app ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY Netipam/Netipam.csproj Netipam/
COPY Netipam.Postgres/Netipam.Postgres.csproj Netipam.Postgres/
RUN dotnet restore Netipam.Postgres/Netipam.Postgres.csproj

COPY . .
COPY --from=web /Netipam/wwwroot/app /src/Netipam/wwwroot/app
RUN dotnet publish Netipam/Netipam.csproj -c Release -o /app/publish /p:UseAppHost=false \
 && dotnet publish Netipam.Postgres/Netipam.Postgres.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

ENV ASPNETCORE_URLS=http://+:7088

COPY --from=build /app/publish .

VOLUME ["/data"]
EXPOSE 7088

ENTRYPOINT ["dotnet", "Netipam.dll"]
