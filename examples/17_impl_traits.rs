trait Add {
    fn add(&self, other: &Self) -> Self;
}

impl Add for i32 {
    fn add(&self, other: &Self) -> Self {
        self + other
    }
}

fn main() {
    let a = 1;
    let b = 2;
    println!("{}", a.add(&b));
}