@echo off
setlocal
set KOHYA=C:\tool\kohya_ss
cd /D %KOHYA%\sd-scripts

call %KOHYA%\venv\Scripts\activate.bat

accelerate launch --num_cpu_threads_per_process 8 train_network.py ^
  --pretrained_model_name_or_path="C:\tool\pp\ComfyUI\models\checkpoints\dreamshaper_8.safetensors" ^
  --train_data_dir="D:\lora_train\jeonggwichan\img" ^
  --output_dir="D:\lora_train\jeonggwichan\model" ^
  --logging_dir="D:\lora_train\jeonggwichan\log" ^
  --output_name="jeonggwichan_v1" ^
  --save_model_as=safetensors ^
  --network_module=networks.lora ^
  --network_dim=32 --network_alpha=16 ^
  --resolution=512,512 --train_batch_size=2 ^
  --max_train_epochs=10 --learning_rate=1e-4 ^
  --unet_lr=1e-4 --text_encoder_lr=5e-5 ^
  --lr_scheduler=cosine_with_restarts --lr_scheduler_num_cycles=3 ^
  --optimizer_type=AdamW8bit --mixed_precision=fp16 ^
  --save_precision=fp16 --cache_latents ^
  --save_every_n_epochs=2 --clip_skip=2 --seed=42 ^
  --max_data_loader_n_workers=4 --xformers ^
  --gradient_checkpointing --network_train_unet_only

endlocal
