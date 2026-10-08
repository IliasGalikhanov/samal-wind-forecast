package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"energy/internal/app"
)

func main() {
	addr := flag.String("addr", "127.0.0.1:8080", "Listen address")
	root := flag.String("root", ".", "Project directory")
	python := flag.String("python", "", "Python executable")
	seed := flag.String("seed", "", "Directory with the two source CSV files")
	flag.Parse()
	absolute, err := filepath.Abs(*root)
	if err != nil {
		log.Fatal(err)
	}
	if *python == "" {
		if runtime.GOOS == "windows" {
			*python = filepath.Join(absolute, ".venv", "Scripts", "python.exe")
		} else {
			*python = filepath.Join(absolute, ".venv", "bin", "python")
		}
	}
	application, err := app.New(absolute, *python)
	if err != nil {
		log.Fatal(err)
	}
	defer application.Close()
	if *seed != "" {
		if err := application.Seed(*seed); err != nil {
			log.Fatal(err)
		}
	}
	server := &http.Server{Addr: *addr, Handler: application.Handler(), ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 2 * time.Minute, WriteTimeout: 2 * time.Minute, IdleTimeout: 60 * time.Second}
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}()
	log.Printf("SAMAL ready at http://%s", *addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
