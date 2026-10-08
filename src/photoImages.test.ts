import { describe, expect, it } from 'vitest'
import { photoOutputSize, sortPhotoFiles } from './photoImages'

describe('photo image preparation', () => {
  it('limits imported image dimensions without enlarging small pages', () => {
    expect(photoOutputSize(6000, 4000)).toEqual({ width: 2560, height: 1707 })
    expect(photoOutputSize(5000, 1000)).toEqual({ width: 2560, height: 512 })
    expect(photoOutputSize(800, 1200)).toEqual({ width: 800, height: 1200 })
  })

  it('sorts folder images naturally by relative path', () => {
    const files = [
      Object.assign(new File(['3'], 'page10.jpg'), { webkitRelativePath: 'pattern/page10.jpg' }),
      Object.assign(new File(['1'], 'page2.jpg'), { webkitRelativePath: 'pattern/page2.jpg' }),
      Object.assign(new File(['2'], 'page1.jpg'), { webkitRelativePath: 'pattern/page1.jpg' }),
    ]
    expect(sortPhotoFiles(files).map((file) => file.name)).toEqual(['page1.jpg', 'page2.jpg', 'page10.jpg'])
  })
})
